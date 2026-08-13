export interface Hymnal {
  id: number;
  code: string;
  title: string;
  publisher: string | null;
  year: number | null;
}

export interface Tune {
  id: number;
  name: string;
  meter: string | null;
  composer: string | null;
  composerYear: number | null;
}

export interface Copyright {
  id: number;
  holder: string | null;
  year: number | null;
  license: string | null;
  ccli: string | null;
  publicDomain: boolean;
  notes: string | null;
}

/** Enough of a hymn to label a recording or a service item. */
export interface HymnSummary {
  id: number;
  hymnalCode: string;
  numberRaw: string;
  title: string;
}

export interface Hymn extends HymnSummary {
  hymnalId: number;
  hymnalTitle: string;
  numberSort: number;
  numberSuffix: string | null;
  firstLine: string | null;
  textAuthor: string | null;
  primaryTuneId: number | null;
  primaryTuneName: string | null;
  altTunes: Tune[];
  /** Every recording this hymn may be sung to; the playlist picks one of these. */
  tracks: Track[];
}

/**
 * A single audio recording, identified by its tune, tempo, key and verse count.
 * Recordings are shared: one file of a common-meter tune may serve any number of
 * hymn texts, so the hymn link lives in a join.
 */
export interface Track {
  id: number;
  sha256: string;
  storagePath: string;
  originalFilename: string | null;
  mime: string;
  durationMs: number | null;
  bitrate: number | null;
  ingestedAt: string;

  tuneId: number | null;
  tuneName: string | null;
  tuneMeter: string | null;
  tuneComposer: string | null;
  tempoBpm: number | null;
  musicKey: string | null;
  verseCount: number | null;
  arrangement: string | null;

  copyright: Copyright | null;
  /** Every hymn this recording is filed under. */
  hymns: HymnSummary[];
}

export type ServiceItemKind = 'hymn' | 'spoken' | 'silence' | 'note';

export interface ServiceItem {
  id: number;
  serviceId: number;
  position: number;
  kind: ServiceItemKind;
  /** The hymn is what the item *is*; the recording is only how it will be played. */
  hymnId: number | null;
  trackId: number | null;
  /** Freeform heading, e.g. "Opening Hymn" or "Distribution". */
  label: string | null;
  gapAfterMs: number;
  autoAdvance: boolean;
  hymn: Hymn | null;
  track: Track | null;
}

export interface Service {
  id: number;
  title: string;
  serviceDate: string | null;
  liturgicalDay: string | null;
  notes: string | null;
}

export interface ServiceDetail extends Service {
  items: ServiceItem[];
}

export interface IngestIssue {
  id: number;
  trackId: number | null;
  severity: 'warn' | 'error';
  field: string;
  message: string;
  createdAt: string;
}

export interface IngestResult {
  track: Track;
  duplicate: boolean;
  issues: Array<Pick<IngestIssue, 'severity' | 'field' | 'message'>>;
}

export interface LibraryQuery {
  q?: string;
  hymnal?: string;
  tune?: string;
  limit?: number;
  offset?: number;
}

export interface HymnalInput {
  code: string;
  title: string;
  publisher?: string | null;
  year?: number | null;
}

export interface HymnInput {
  hymnalId: number;
  numberRaw: string;
  title: string;
  firstLine?: string | null;
  textAuthor?: string | null;
  primaryTuneName?: string | null;
  altTuneNames?: string[];
}

export interface TrackInput {
  tuneName?: string | null;
  tempoBpm?: number | null;
  musicKey?: string | null;
  verseCount?: number | null;
  arrangement?: string | null;
}

/**
 * ID3v2 frame names this app reads and writes. Standard frames carry standard
 * data; everything church-specific lives in a TXXX user-defined text frame.
 */
export const TAG_FRAMES = {
  title: 'TIT2',
  composer: 'TCOM',
  copyright: 'TCOP',
  hymnal: 'TXXX:HYMNAL',
  hymnNumber: 'TXXX:HYMN_NUMBER',
  hymnTune: 'TXXX:HYMN_TUNE',
  altHymnTune: 'TXXX:ALT_HYMN_TUNE',
  meter: 'TXXX:METER',
  textAuthor: 'TXXX:TEXT_AUTHOR',
  firstLine: 'TXXX:FIRST_LINE',
  arrangement: 'TXXX:ARRANGEMENT',
  tempo: 'TXXX:TEMPO',
  musicKey: 'TXXX:KEY',
  verseCount: 'TXXX:VERSE_COUNT',
  verses: 'TXXX:VERSES',
  ccli: 'TXXX:CCLI',
  publicDomain: 'TXXX:PD',
  copyrightYear: 'TXXX:COPYRIGHT_YEAR',
  license: 'TXXX:LICENSE',
} as const;

/** Separator for multi-valued TXXX frames, e.g. ALT_HYMN_TUNE. */
export const MULTI_VALUE_SEPARATOR = ';';
