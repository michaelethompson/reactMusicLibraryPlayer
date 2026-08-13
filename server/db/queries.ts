import { db, ftsAvailable } from './index.ts';
import type {
  Hymn,
  HymnSummary,
  Hymnal,
  LibraryQuery,
  Service,
  ServiceDetail,
  ServiceItem,
  Track,
  Tune,
} from '@shared/types';

type Row = Record<string, string | number | null>;

const TRACK_SELECT = `
  SELECT
    t.id                AS id,
    t.sha256            AS sha256,
    t.storage_path      AS storage_path,
    t.original_filename AS original_filename,
    t.mime              AS mime,
    t.duration_ms       AS duration_ms,
    t.bitrate           AS bitrate,
    t.ingested_at       AS ingested_at,
    t.tune_id           AS tune_id,
    tu.name             AS tune_name,
    tu.meter            AS tune_meter,
    tu.composer         AS tune_composer,
    t.tempo_bpm         AS tempo_bpm,
    t.music_key         AS music_key,
    t.verse_count       AS verse_count,
    t.arrangement       AS arrangement,
    c.id                AS copyright_id,
    c.holder            AS copyright_holder,
    c.year              AS copyright_year,
    c.license           AS copyright_license,
    c.ccli              AS copyright_ccli,
    c.public_domain     AS copyright_public_domain,
    c.notes             AS copyright_notes
  FROM tracks t
  LEFT JOIN tunes      tu ON tu.id = t.tune_id
  LEFT JOIN copyrights c  ON c.id  = t.copyright_id
`;

function hymnsForTrack(trackId: number): HymnSummary[] {
  return (
    db
      .prepare(`
        SELECT h.id AS id, hl.code AS hymnalCode, h.number_raw AS numberRaw, h.title AS title
        FROM hymn_tracks ht
        JOIN hymns   h  ON h.id  = ht.hymn_id
        JOIN hymnals hl ON hl.id = h.hymnal_id
        WHERE ht.track_id = ?
        ORDER BY hl.code, h.number_sort, h.number_suffix
      `)
      .all(trackId) as unknown as HymnSummary[]
  ).map((row) => ({ ...row, id: Number(row.id) }));
}

function mapTrack(row: Row): Track {
  return {
    id: Number(row.id),
    sha256: String(row.sha256),
    storagePath: String(row.storage_path),
    originalFilename: (row.original_filename as string) ?? null,
    mime: String(row.mime),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    bitrate: row.bitrate === null ? null : Number(row.bitrate),
    ingestedAt: String(row.ingested_at),
    tuneId: row.tune_id === null ? null : Number(row.tune_id),
    tuneName: (row.tune_name as string) ?? null,
    tuneMeter: (row.tune_meter as string) ?? null,
    tuneComposer: (row.tune_composer as string) ?? null,
    tempoBpm: row.tempo_bpm === null ? null : Number(row.tempo_bpm),
    musicKey: (row.music_key as string) ?? null,
    verseCount: row.verse_count === null ? null : Number(row.verse_count),
    arrangement: (row.arrangement as string) ?? null,
    copyright:
      row.copyright_id === null
        ? null
        : {
            id: Number(row.copyright_id),
            holder: (row.copyright_holder as string) ?? null,
            year: row.copyright_year === null ? null : Number(row.copyright_year),
            license: (row.copyright_license as string) ?? null,
            ccli: (row.copyright_ccli as string) ?? null,
            publicDomain: Number(row.copyright_public_domain ?? 0) === 1,
            notes: (row.copyright_notes as string) ?? null,
          },
    hymns: hymnsForTrack(Number(row.id)),
  };
}

export function getTrack(id: number): Track | null {
  const row = db.prepare(`${TRACK_SELECT} WHERE t.id = ?`).get(id) as Row | undefined;
  return row ? mapTrack(row) : null;
}

export function listTracks(query: LibraryQuery = {}): Track[] {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (query.tune) {
    where.push('tu.name = ?');
    params.push(query.tune.toUpperCase());
  }
  if (query.q?.trim()) {
    where.push('(t.original_filename LIKE ? OR tu.name LIKE ?)');
    params.push(`%${query.q.trim()}%`, `%${query.q.trim().toUpperCase()}%`);
  }

  const rows = db
    .prepare(`
      ${TRACK_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY t.ingested_at DESC
      LIMIT ?
    `)
    .all(...params, query.limit ?? 500) as Row[];
  return rows.map(mapTrack);
}

/** Recordings not yet linked to any hymn; they need filing before they can be sung. */
export function listUnfiledTracks(): Track[] {
  const rows = db
    .prepare(`
      ${TRACK_SELECT}
      WHERE NOT EXISTS (SELECT 1 FROM hymn_tracks ht WHERE ht.track_id = t.id)
      ORDER BY t.ingested_at DESC
    `)
    .all() as Row[];
  return rows.map(mapTrack);
}

export function tracksForHymn(hymnId: number): Track[] {
  const rows = db
    .prepare(`
      ${TRACK_SELECT}
      JOIN hymn_tracks ht ON ht.track_id = t.id
      WHERE ht.hymn_id = ?
      ORDER BY ht.rank, tu.name, t.id
    `)
    .all(hymnId) as Row[];
  return rows.map(mapTrack);
}

const HYMN_SELECT = `
  SELECT
    h.id              AS id,
    h.hymnal_id       AS hymnalId,
    hl.code           AS hymnalCode,
    hl.title          AS hymnalTitle,
    h.number_raw      AS numberRaw,
    h.number_sort     AS numberSort,
    h.number_suffix   AS numberSuffix,
    h.title           AS title,
    h.first_line      AS firstLine,
    h.text_author     AS textAuthor,
    h.primary_tune_id AS primaryTuneId,
    tu.name           AS primaryTuneName
  FROM hymns h
  JOIN hymnals hl ON hl.id = h.hymnal_id
  LEFT JOIN tunes tu ON tu.id = h.primary_tune_id
`;

function altTunes(hymnId: number): Tune[] {
  return db
    .prepare(`
      SELECT tu.id AS id, tu.name AS name, tu.meter AS meter,
             tu.composer AS composer, tu.composer_year AS composerYear
      FROM hymn_alt_tunes hat
      JOIN tunes tu ON tu.id = hat.tune_id
      WHERE hat.hymn_id = ?
      ORDER BY hat.rank, tu.name
    `)
    .all(hymnId) as unknown as Tune[];
}

function mapHymn(row: Row): Hymn {
  const id = Number(row.id);
  return {
    id,
    hymnalId: Number(row.hymnalId),
    hymnalCode: String(row.hymnalCode),
    hymnalTitle: String(row.hymnalTitle),
    numberRaw: String(row.numberRaw),
    numberSort: Number(row.numberSort),
    numberSuffix: (row.numberSuffix as string) ?? null,
    title: String(row.title),
    firstLine: (row.firstLine as string) ?? null,
    textAuthor: (row.textAuthor as string) ?? null,
    primaryTuneId: row.primaryTuneId === null ? null : Number(row.primaryTuneId),
    primaryTuneName: (row.primaryTuneName as string) ?? null,
    altTunes: altTunes(id),
    tracks: tracksForHymn(id),
  };
}

export function getHymn(id: number): Hymn | null {
  const row = db.prepare(`${HYMN_SELECT} WHERE h.id = ?`).get(id) as Row | undefined;
  return row ? mapHymn(row) : null;
}

export function listHymns(query: LibraryQuery = {}): Hymn[] {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (query.hymnal) {
    where.push('hl.code = ?');
    params.push(query.hymnal.toUpperCase());
  }

  if (query.tune) {
    // Either the hymn names the tune, or one of its recordings is of that tune.
    where.push(`(
      tu.name = ?
      OR EXISTS (SELECT 1 FROM hymn_alt_tunes hat JOIN tunes a ON a.id = hat.tune_id
                 WHERE hat.hymn_id = h.id AND a.name = ?)
      OR EXISTS (SELECT 1 FROM hymn_tracks ht JOIN tracks t ON t.id = ht.track_id
                 JOIN tunes b ON b.id = t.tune_id
                 WHERE ht.hymn_id = h.id AND b.name = ?)
    )`);
    const tune = query.tune.toUpperCase();
    params.push(tune, tune, tune);
  }

  const term = query.q?.trim();
  if (term) {
    if (ftsAvailable) {
      // Prefix-match each token so search feels live while typing.
      const match = term
        .split(/\s+/)
        .map((token) => `${token.replace(/["*]/g, '')}*`)
        .join(' ');
      where.push(`(
        h.id IN (SELECT hymn_id FROM hymns_fts WHERE hymns_fts MATCH ?)
        OR h.number_raw = ?
        OR tu.name LIKE ?
      )`);
      params.push(match, term, `%${term.toUpperCase()}%`);
    } else {
      where.push('(h.title LIKE ? OR h.first_line LIKE ? OR h.number_raw = ? OR tu.name LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, term, `%${term.toUpperCase()}%`);
    }
  }

  const rows = db
    .prepare(`
      ${HYMN_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY hl.code, h.number_sort, h.number_suffix
      LIMIT ?
    `)
    .all(...params, query.limit ?? 500) as Row[];
  return rows.map(mapHymn);
}

export function listHymnals(): Array<Hymnal & { hymnCount: number; aliases: string[] }> {
  const rows = db
    .prepare(`
      SELECT hl.id AS id, hl.code AS code, hl.title AS title,
             hl.publisher AS publisher, hl.year AS year,
             (SELECT COUNT(*) FROM hymns h WHERE h.hymnal_id = hl.id) AS hymnCount
      FROM hymnals hl
      ORDER BY hl.code
    `)
    .all() as Row[];

  const aliasStmt = db.prepare('SELECT alias FROM hymnal_aliases WHERE hymnal_id = ? ORDER BY alias');

  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    title: String(row.title),
    publisher: (row.publisher as string) ?? null,
    year: row.year === null ? null : Number(row.year),
    hymnCount: Number(row.hymnCount),
    aliases: (aliasStmt.all(Number(row.id)) as Array<{ alias: string }>).map((r) => r.alias),
  }));
}

export function listTunes(): Tune[] {
  return db
    .prepare(`
      SELECT id, name, meter, composer, composer_year AS composerYear
      FROM tunes ORDER BY name
    `)
    .all() as unknown as Tune[];
}

export function listServices(): Service[] {
  return db
    .prepare(`
      SELECT id, title, service_date AS serviceDate,
             liturgical_day AS liturgicalDay, notes
      FROM services
      ORDER BY COALESCE(service_date, '') DESC, id DESC
    `)
    .all() as unknown as Service[];
}

export function getService(id: number): ServiceDetail | null {
  const service = db
    .prepare(`
      SELECT id, title, service_date AS serviceDate,
             liturgical_day AS liturgicalDay, notes
      FROM services WHERE id = ?
    `)
    .get(id) as unknown as Service | undefined;
  if (!service) return null;

  const rows = db
    .prepare(`
      SELECT id, service_id, position, kind, hymn_id, track_id, label, gap_after_ms, auto_advance
      FROM service_items
      WHERE service_id = ?
      ORDER BY position, id
    `)
    .all(id) as Row[];

  const items: ServiceItem[] = rows.map((row) => ({
    id: Number(row.id),
    serviceId: Number(row.service_id),
    position: Number(row.position),
    kind: String(row.kind) as ServiceItem['kind'],
    hymnId: row.hymn_id === null ? null : Number(row.hymn_id),
    trackId: row.track_id === null ? null : Number(row.track_id),
    label: (row.label as string) ?? null,
    gapAfterMs: Number(row.gap_after_ms),
    autoAdvance: Number(row.auto_advance) === 1,
    hymn: row.hymn_id === null ? null : getHymn(Number(row.hymn_id)),
    track: row.track_id === null ? null : getTrack(Number(row.track_id)),
  }));

  return { ...service, items };
}
