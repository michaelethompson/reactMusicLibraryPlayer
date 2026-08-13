import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DB_PATH = path.join(here, 'library.db');
export const MEDIA_ROOT = path.join(here, '..', 'media', 'audio');
export const UPLOAD_TMP = path.join(here, '..', 'media', 'tmp');
export const ORIGINALS_ROOT = path.join(here, '..', 'media', 'originals');

for (const dir of [MEDIA_ROOT, UPLOAD_TMP, ORIGINALS_ROOT]) {
  mkdirSync(dir, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

db.exec(readFileSync(path.join(here, 'schema.sql'), 'utf8'));

function hasColumn(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

/** Moves databases created before recordings could be shared between hymns. */
function migrate(): void {
  if (hasColumn('tracks', 'hymn_id')) {
    db.exec('DROP INDEX IF EXISTS idx_tracks_hymn');
    db.exec(`
      INSERT OR IGNORE INTO hymn_tracks (hymn_id, track_id)
      SELECT hymn_id, id FROM tracks WHERE hymn_id IS NOT NULL
    `);
    db.exec('ALTER TABLE tracks DROP COLUMN hymn_id');
  }

  if (!hasColumn('service_items', 'hymn_id')) {
    db.exec('ALTER TABLE service_items ADD COLUMN hymn_id INTEGER REFERENCES hymns(id)');
    db.exec(`
      UPDATE service_items
      SET hymn_id = (SELECT hymn_id FROM hymn_tracks WHERE track_id = service_items.track_id LIMIT 1)
      WHERE track_id IS NOT NULL
    `);
  }

  // Recordings are now identified by tune, tempo, key and verse count.
  for (const [column, definition] of [
    ['tempo_bpm', 'INTEGER'],
    ['music_key', 'TEXT'],
    ['verse_count', 'INTEGER'],
  ] as const) {
    if (!hasColumn('tracks', column)) {
      db.exec(`ALTER TABLE tracks ADD COLUMN ${column} ${definition}`);
    }
  }

  if (hasColumn('tracks', 'verses')) {
    db.exec(`
      UPDATE tracks
      SET verse_count = LENGTH(verses) - LENGTH(REPLACE(verses, ',', '')) + 1
      WHERE verse_count IS NULL AND verses IS NOT NULL AND verses != ''
    `);
    db.exec('ALTER TABLE tracks DROP COLUMN verses');
  }

  if (hasColumn('service_items', 'verses')) {
    db.exec('ALTER TABLE service_items DROP COLUMN verses');
  }
}

migrate();

/**
 * FTS5 ships with Node's bundled SQLite, but degrade to LIKE search rather than
 * refusing to boot if a build lacks it.
 */
export const ftsAvailable = (() => {
  try {
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS hymns_fts
       USING fts5(title, first_line, text_author, hymn_id UNINDEXED)`,
    );
    return true;
  } catch {
    return false;
  }
})();

export function reindexHymn(hymnId: number): void {
  if (!ftsAvailable) return;
  db.prepare('DELETE FROM hymns_fts WHERE hymn_id = ?').run(hymnId);
  const row = db
    .prepare('SELECT title, first_line, text_author FROM hymns WHERE id = ?')
    .get(hymnId) as { title: string; first_line: string | null; text_author: string | null } | undefined;
  if (!row) return;
  db.prepare(
    'INSERT INTO hymns_fts (title, first_line, text_author, hymn_id) VALUES (?, ?, ?, ?)',
  ).run(row.title, row.first_line ?? '', row.text_author ?? '', hymnId);
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
