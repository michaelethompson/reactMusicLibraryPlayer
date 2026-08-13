import type { HymnSummary, Track } from '@shared/types';

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms < 0) return '–:––';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function hymnReference(hymn: HymnSummary | null | undefined): string {
  return hymn ? `${hymn.hymnalCode} ${hymn.numberRaw}` : 'Unfiled';
}

export function trackLabel(track: Track, hymn?: HymnSummary | null): string {
  return hymn?.title ?? track.originalFilename ?? `Recording ${track.id}`;
}

export function copyrightLine(track: Track): string {
  const rights = track.copyright;
  if (!rights) return 'Copyright unknown — review before use';
  if (rights.publicDomain) return 'Public domain';
  return (
    [rights.holder, rights.year, rights.license, rights.ccli && `CCLI ${rights.ccli}`]
      .filter(Boolean)
      .join(' · ') || 'Copyright unknown — review before use'
  );
}
