import { db } from './index.ts';
import { canonicalHymnalCode, canonicalTuneName } from '../ingest/normalize.ts';

export function lastId(result: { lastInsertRowid: number | bigint }): number {
  return Number(result.lastInsertRowid);
}

export function resolveHymnal(rawCode: string, title?: string | null): number {
  const code = canonicalHymnalCode(rawCode);
  if (!code) throw new Error('A hymnal code is required');

  const alias = db
    .prepare('SELECT hymnal_id AS id FROM hymnal_aliases WHERE alias = ?')
    .get(code) as { id: number } | undefined;
  if (alias) return Number(alias.id);

  const existing = db.prepare('SELECT id FROM hymnals WHERE code = ?').get(code) as
    | { id: number }
    | undefined;
  if (existing) return Number(existing.id);

  return lastId(
    db.prepare('INSERT INTO hymnals (code, title) VALUES (?, ?)').run(code, title?.trim() || code),
  );
}

export function resolveTune(
  rawName: string,
  meter: string | null = null,
  composer: string | null = null,
): number {
  const name = canonicalTuneName(rawName);
  if (!name) throw new Error('A tune name is required');

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

export function setAltTunes(hymnId: number, names: string[]): void {
  db.prepare('DELETE FROM hymn_alt_tunes WHERE hymn_id = ?').run(hymnId);
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO hymn_alt_tunes (hymn_id, tune_id, rank) VALUES (?, ?, ?)',
  );
  names
    .map((name) => canonicalTuneName(name))
    .filter((name): name is string => name !== null)
    .forEach((name, index) => stmt.run(hymnId, resolveTune(name), index));
}

export function addAltTunes(hymnId: number, names: string[]): void {
  const next = db
    .prepare('SELECT COALESCE(MAX(rank), -1) + 1 AS next FROM hymn_alt_tunes WHERE hymn_id = ?')
    .get(hymnId) as { next: number };
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO hymn_alt_tunes (hymn_id, tune_id, rank) VALUES (?, ?, ?)',
  );
  names
    .map((name) => canonicalTuneName(name))
    .filter((name): name is string => name !== null)
    .forEach((name, index) => stmt.run(hymnId, resolveTune(name), Number(next.next) + index));
}

export function linkTrack(hymnId: number, trackId: number): void {
  const next = db
    .prepare('SELECT COALESCE(MAX(rank), -1) + 1 AS next FROM hymn_tracks WHERE hymn_id = ?')
    .get(hymnId) as { next: number };
  db.prepare('INSERT OR IGNORE INTO hymn_tracks (hymn_id, track_id, rank) VALUES (?, ?, ?)').run(
    hymnId,
    trackId,
    Number(next.next),
  );

  // An untagged recording filed under a hymn is presumed to be that hymn's tune.
  db.prepare(`
    UPDATE tracks
    SET tune_id = (SELECT primary_tune_id FROM hymns WHERE id = ?)
    WHERE id = ? AND tune_id IS NULL
  `).run(hymnId, trackId);
}

export function unlinkTrack(hymnId: number, trackId: number): number {
  return db
    .prepare('DELETE FROM hymn_tracks WHERE hymn_id = ? AND track_id = ?')
    .run(hymnId, trackId).changes as number;
}
