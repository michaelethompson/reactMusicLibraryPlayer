import type { Track } from '@shared/types';

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms < 0) return '–:––';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function trackReference(track: Track): string {
  return [track.hymnalCode, track.hymnNumber].filter(Boolean).join(' ') || 'Unfiled';
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
