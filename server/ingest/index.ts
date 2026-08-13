import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db, MEDIA_ROOT, reindexHymn, transaction } from '../db/index.ts';
import { getTrack } from '../db/queries.ts';
import { sha256File, shardedPath } from './hash.ts';
import { parseTags, type ParsedTags } from './tagParser.ts';
import type { IngestResult } from '@shared/types';

type Issue = IngestResult['issues'][number];

function lastId(result: { lastInsertRowid: number | bigint }): number {
  return Number(result.lastInsertRowid);
}

function resolveHymnal(code: string): number {
  const alias = db
    .prepare('SELECT hymnal_id AS id FROM hymnal_aliases WHERE alias = ?')
    .get(code) as { id: number } | undefined;
  if (alias) return Number(alias.id);

  const existing = db.prepare('SELECT id FROM hymnals WHERE code = ?').get(code) as
    | { id: number }
    | undefined;
  if (existing) return Number(existing.id);

  return lastId(
    db.prepare('INSERT INTO hymnals (code, title) VALUES (?, ?)').run(code, code),
  );
}

function resolveTune(name: string, meter: string | null, composer: string | null): number {
  const existing = db.prepare('SELECT id FROM tunes WHERE name = ?').get(name) as
    | { id: number }
    | undefined;
  if (existing) {
    // Backfill details a later, better-tagged file supplies.
    db.prepare(
      'UPDATE tunes SET meter = COALESCE(meter, ?), composer = COALESCE(composer, ?) WHERE id = ?',
    ).run(meter, composer, existing.id);
    return Number(existing.id);
  }
  return lastId(
    db
      .prepare('INSERT INTO tunes (name, meter, composer) VALUES (?, ?, ?)')
      .run(name, meter, composer),
  );
}

function resolveHymn(hymnalId: number, tags: ParsedTags, primaryTuneId: number | null): number {
  const number = tags.hymnNumber!;
  const existing = db
    .prepare('SELECT id FROM hymns WHERE hymnal_id = ? AND number_raw = ?')
    .get(hymnalId, number.raw) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE hymns SET
        first_line      = COALESCE(first_line, ?),
        text_author     = COALESCE(text_author, ?),
        primary_tune_id = COALESCE(primary_tune_id, ?)
      WHERE id = ?
    `).run(tags.firstLine, tags.textAuthor, primaryTuneId, existing.id);
    reindexHymn(Number(existing.id));
    return Number(existing.id);
  }

  const id = lastId(
    db
      .prepare(`
        INSERT INTO hymns
          (hymnal_id, number_raw, number_sort, number_suffix, title, first_line, text_author, primary_tune_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        hymnalId,
        number.raw,
        number.sort,
        number.suffix,
        tags.title ?? `${number.raw}`,
        tags.firstLine,
        tags.textAuthor,
        primaryTuneId,
      ),
  );
  reindexHymn(id);
  return id;
}

function resolveCopyright(tags: ParsedTags): number | null {
  const hasData =
    tags.copyrightHolder || tags.copyrightYear || tags.license || tags.ccli || tags.publicDomain;
  if (!hasData) return null;

  const pd = tags.publicDomain ? 1 : 0;
  const existing = db
    .prepare(`
      SELECT id FROM copyrights
      WHERE holder IS ? AND year IS ? AND license IS ? AND ccli IS ? AND public_domain = ?
    `)
    .get(tags.copyrightHolder, tags.copyrightYear, tags.license, tags.ccli, pd) as
    | { id: number }
    | undefined;
  if (existing) return Number(existing.id);

  return lastId(
    db
      .prepare(
        'INSERT INTO copyrights (holder, year, license, ccli, public_domain) VALUES (?, ?, ?, ?, ?)',
      )
      .run(tags.copyrightHolder, tags.copyrightYear, tags.license, tags.ccli, pd),
  );
}

function recordIssues(trackId: number, issues: Issue[]): void {
  const stmt = db.prepare(
    'INSERT INTO ingest_issues (track_id, severity, field, message, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const now = new Date().toISOString();
  for (const issue of issues) stmt.run(trackId, issue.severity, issue.field, issue.message, now);
}

export async function ingestFile(
  tmpPath: string,
  originalFilename: string,
  mime: string,
): Promise<IngestResult> {
  const sha256 = await sha256File(tmpPath);

  const duplicate = db.prepare('SELECT id FROM tracks WHERE sha256 = ?').get(sha256) as
    | { id: number }
    | undefined;
  if (duplicate) {
    await unlink(tmpPath).catch(() => {});
    return { track: getTrack(Number(duplicate.id))!, duplicate: true, issues: [] };
  }

  const tags = await parseTags(tmpPath);
  const issues: Issue[] = [];

  const ext = path.extname(originalFilename).toLowerCase() || '.mp3';
  const storagePath = shardedPath(sha256, ext);
  const destination = path.join(MEDIA_ROOT, storagePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(tmpPath, destination);

  const trackId = transaction(() => {
    const tuneId = tags.tuneName
      ? resolveTune(tags.tuneName, tags.meter, tags.composer)
      : null;
    if (!tags.tuneName) {
      issues.push({ severity: 'warn', field: 'HYMN_TUNE', message: 'No tune tag; track is unassigned to a tune.' });
    }

    let hymnId: number | null = null;
    if (tags.hymnalCode && tags.hymnNumber) {
      const hymnalId = resolveHymnal(tags.hymnalCode);
      hymnId = resolveHymn(hymnalId, tags, tuneId);

      const altStmt = db.prepare(
        'INSERT OR IGNORE INTO hymn_alt_tunes (hymn_id, tune_id, rank) VALUES (?, ?, ?)',
      );
      tags.altTuneNames.forEach((name, index) => {
        altStmt.run(hymnId!, resolveTune(name, null, null), index);
      });
    } else {
      issues.push({
        severity: 'error',
        field: !tags.hymnalCode ? 'HYMNAL' : 'HYMN_NUMBER',
        message: 'Missing hymnal or hymn number; track needs manual review before it can be filed.',
      });
    }

    const copyrightId = resolveCopyright(tags);
    if (!copyrightId) {
      issues.push({ severity: 'warn', field: 'TCOP', message: 'No copyright or public-domain information found.' });
    }

    const id = lastId(
      db
        .prepare(`
          INSERT INTO tracks
            (sha256, storage_path, original_filename, mime, duration_ms, bitrate,
             hymn_id, tune_id, copyright_id, arrangement, verses, raw_tags, ingested_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          sha256,
          storagePath,
          originalFilename,
          mime,
          tags.durationMs,
          tags.bitrate,
          hymnId,
          tuneId,
          copyrightId,
          tags.arrangement,
          tags.verses,
          JSON.stringify(tags.raw),
          new Date().toISOString(),
        ),
    );

    recordIssues(id, issues);
    return id;
  });

  return { track: getTrack(trackId)!, duplicate: false, issues };
}
