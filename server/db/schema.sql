PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hymnals (
  id        INTEGER PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,
  title     TEXT NOT NULL,
  publisher TEXT,
  year      INTEGER
);

-- Maps the messy strings that show up in tags onto a canonical hymnal code.
CREATE TABLE IF NOT EXISTS hymnal_aliases (
  alias     TEXT PRIMARY KEY,
  hymnal_id INTEGER NOT NULL REFERENCES hymnals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tunes (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  meter         TEXT,
  composer      TEXT,
  composer_year INTEGER
);

CREATE TABLE IF NOT EXISTS hymns (
  id              INTEGER PRIMARY KEY,
  hymnal_id       INTEGER NOT NULL REFERENCES hymnals(id) ON DELETE CASCADE,
  number_raw      TEXT NOT NULL,
  number_sort     INTEGER NOT NULL,
  number_suffix   TEXT,
  title           TEXT NOT NULL,
  first_line      TEXT,
  text_author     TEXT,
  primary_tune_id INTEGER REFERENCES tunes(id) ON DELETE SET NULL,
  UNIQUE (hymnal_id, number_raw)
);

CREATE INDEX IF NOT EXISTS idx_hymns_sort ON hymns (hymnal_id, number_sort, number_suffix);

CREATE TABLE IF NOT EXISTS hymn_alt_tunes (
  hymn_id INTEGER NOT NULL REFERENCES hymns(id) ON DELETE CASCADE,
  tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
  rank    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hymn_id, tune_id)
);

CREATE TABLE IF NOT EXISTS copyrights (
  id            INTEGER PRIMARY KEY,
  holder        TEXT,
  year          INTEGER,
  license       TEXT,
  ccli          TEXT,
  public_domain INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  UNIQUE (holder, year, license, ccli, public_domain)
);

CREATE TABLE IF NOT EXISTS tracks (
  id                INTEGER PRIMARY KEY,
  sha256            TEXT NOT NULL UNIQUE,
  storage_path      TEXT NOT NULL,
  original_filename TEXT,
  mime              TEXT NOT NULL,
  duration_ms       INTEGER,
  bitrate           INTEGER,
  tune_id           INTEGER REFERENCES tunes(id) ON DELETE SET NULL,
  copyright_id      INTEGER REFERENCES copyrights(id) ON DELETE SET NULL,
  arrangement       TEXT,
  verses            TEXT,
  raw_tags          TEXT,
  ingested_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_tune ON tracks (tune_id);

-- One recording can serve many hymns (a shared tune under several texts), and a
-- hymn can have many recordings (different tunes, verses, or arrangements).
CREATE TABLE IF NOT EXISTS hymn_tracks (
  hymn_id  INTEGER NOT NULL REFERENCES hymns(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  rank     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hymn_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_hymn_tracks_track ON hymn_tracks (track_id);

CREATE TABLE IF NOT EXISTS services (
  id             INTEGER PRIMARY KEY,
  title          TEXT NOT NULL,
  service_date   TEXT,
  liturgical_day TEXT,
  notes          TEXT
);

CREATE TABLE IF NOT EXISTS service_items (
  id           INTEGER PRIMARY KEY,
  service_id   INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  -- REAL so a drag-reorder can insert between neighbours without renumbering.
  position     REAL NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('hymn', 'spoken', 'silence', 'note')),
  track_id     INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  hymn_id      INTEGER REFERENCES hymns(id) ON DELETE SET NULL,
  label        TEXT,
  verses       TEXT,
  gap_after_ms INTEGER NOT NULL DEFAULT 0,
  auto_advance INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_service_items_order ON service_items (service_id, position);

-- Anything the ingester could not confidently resolve lands here for review
-- rather than silently creating junk rows.
CREATE TABLE IF NOT EXISTS ingest_issues (
  id         INTEGER PRIMARY KEY,
  track_id   INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
  severity   TEXT NOT NULL CHECK (severity IN ('warn', 'error')),
  field      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
