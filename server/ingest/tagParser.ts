import { parseFile } from 'music-metadata';
import { TAG_FRAMES } from '@shared/types';
import {
  canonicalHymnalCode,
  canonicalTuneName,
  clean,
  parseBoolean,
  parseHymnNumber,
  parseYear,
  splitMulti,
  type ParsedNumber,
} from './normalize.ts';

export interface ParsedTags {
  title: string | null;
  firstLine: string | null;
  textAuthor: string | null;
  composer: string | null;
  hymnalCode: string | null;
  hymnNumber: ParsedNumber | null;
  tuneName: string | null;
  altTuneNames: string[];
  meter: string | null;
  arrangement: string | null;
  verses: string | null;
  copyrightHolder: string | null;
  copyrightYear: number | null;
  license: string | null;
  ccli: string | null;
  publicDomain: boolean;
  durationMs: number | null;
  bitrate: number | null;
  raw: Record<string, string[]>;
}

/** Flattens every ID3v2.x frame into `id -> values`, keeping TXXX descriptions. */
function collectFrames(native: Record<string, Array<{ id: string; value: unknown }>>) {
  const frames = new Map<string, string[]>();
  for (const [format, tags] of Object.entries(native)) {
    if (!format.startsWith('ID3v2')) continue;
    for (const tag of tags) {
      const value = clean(typeof tag.value === 'object' ? JSON.stringify(tag.value) : tag.value);
      if (!value) continue;
      const key = tag.id.toUpperCase();
      frames.set(key, [...(frames.get(key) ?? []), value]);
    }
  }
  return frames;
}

export async function parseTags(filePath: string): Promise<ParsedTags> {
  const metadata = await parseFile(filePath, { duration: true });
  const frames = collectFrames(
    metadata.native as Record<string, Array<{ id: string; value: unknown }>>,
  );

  const first = (frame: string) => frames.get(frame.toUpperCase())?.[0] ?? null;
  const all = (frame: string) => frames.get(frame.toUpperCase()) ?? [];

  // Repeated TXXX frames and separator-delimited values are both accepted.
  const altTuneNames = [...new Set(
    all(TAG_FRAMES.altHymnTune)
      .flatMap(splitMulti)
      .map(canonicalTuneName)
      .filter((name): name is string => name !== null),
  )];

  return {
    title: clean(first(TAG_FRAMES.title) ?? metadata.common.title),
    firstLine: clean(first(TAG_FRAMES.firstLine)),
    textAuthor: clean(first(TAG_FRAMES.textAuthor)),
    composer: clean(first(TAG_FRAMES.composer) ?? metadata.common.composer?.[0]),
    hymnalCode: canonicalHymnalCode(first(TAG_FRAMES.hymnal)),
    hymnNumber: parseHymnNumber(first(TAG_FRAMES.hymnNumber)),
    tuneName: canonicalTuneName(first(TAG_FRAMES.hymnTune)),
    altTuneNames,
    meter: clean(first(TAG_FRAMES.meter)),
    arrangement: clean(first(TAG_FRAMES.arrangement)),
    verses: clean(first(TAG_FRAMES.verses)),
    copyrightHolder: clean(first(TAG_FRAMES.copyright) ?? metadata.common.copyright),
    copyrightYear: parseYear(first(TAG_FRAMES.copyrightYear) ?? first(TAG_FRAMES.copyright)),
    license: clean(first(TAG_FRAMES.license)),
    ccli: clean(first(TAG_FRAMES.ccli)),
    publicDomain: parseBoolean(first(TAG_FRAMES.publicDomain)),
    durationMs: metadata.format.duration ? Math.round(metadata.format.duration * 1000) : null,
    bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate) : null,
    raw: Object.fromEntries(frames),
  };
}
