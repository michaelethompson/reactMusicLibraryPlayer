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
  trackCount: number;
}

/**
 * A single audio recording. Recordings are shared: one file of a common-meter
 * tune may serve any number of hymn texts, so the hymn link lives in a join.
 */
export interface Track {
  id: number;
  sha256: string;
  storagePath: string;
  originalFilename: string | null;
  mime: string;
  durationMs: number | null;
  bitrate: number | null;
  arrangement: string | null;
  verses: string | null;
  ingestedAt: string;

  /** The tune this particular recording is sung to. */
  tuneId: number | null;
  tuneName: string | null;
  tuneMeter: string | null;
  tuneComposer: string | null;

  copyright: Copyright | null;
  /** Every hymn this recording is filed under. */
  hymns: HymnSummary[];
}

/** One row of the library browser: a recording seen through one hymn, or unfiled. */
export interface LibraryEntry {
  id: string;
  hymn: Hymn | null;
  track: Track;
}

export type ServiceItemKind = 'hymn' | 'spoken' | 'silence' | 'note';

export interface ServiceItem {
  id: number;
  serviceId: number;
  position: number;
  kind: ServiceItemKind;
  trackId: number | null;
  /** Which hymn this recording is being used as, since a file may serve several. */
  hymnId: number | null;
  label: string | null;
  verses: string | null;
  gapAfterMs: number;
  autoAdvance: boolean;
  track: Track | null;
  hymn: HymnSummary | null;
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
  /** Only recordings that are not filed under any hymn yet. */
  unfiled?: boolean;
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
  arrangement?: string | null;
  verses?: string | null;
  tuneName?: string | null;
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
  verses: 'TXXX:VERSES',
  ccli: 'TXXX:CCLI',
  publicDomain: 'TXXX:PD',
  copyrightYear: 'TXXX:COPYRIGHT_YEAR',
  license: 'TXXX:LICENSE',
} as const;

/** Separator for multi-valued TXXX frames, e.g. ALT_HYMN_TUNE. */
export const MULTI_VALUE_SEPARATOR = ';';
