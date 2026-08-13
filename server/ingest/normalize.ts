import { MULTI_VALUE_SEPARATOR } from '@shared/types';

export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

/**
 * Tune names are identifiers, not prose: NICAEA, EBENEZER, HYFRYDOL. Folding
 * case and whitespace here is what stops "Nicaea " and "NICAEA" becoming two rows.
 */
export function canonicalTuneName(value: unknown): string | null {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

/** Hymnal codes are short and stable: LSB, TLH, ELW, 1982. */
export function canonicalHymnalCode(value: unknown): string | null {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

export function splitMulti(value: unknown): string[] {
  const text = clean(value);
  if (!text) return [];
  return text
    .split(new RegExp(`[${MULTI_VALUE_SEPARATOR}\u0000/]`))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export interface ParsedNumber {
  raw: string;
  sort: number;
  suffix: string | null;
}

/**
 * Hymn numbers are not integers: "151a", "S 280", "603b" are all real. Keep the
 * raw string for display and derive a numeric key so ordering still works.
 */
export function parseHymnNumber(value: unknown): ParsedNumber | null {
  const raw = clean(value);
  if (!raw) return null;
  const match = raw.match(/(\d+)/);
  if (!match) return { raw, sort: Number.MAX_SAFE_INTEGER, suffix: raw };
  const sort = Number.parseInt(match[1], 10);
  const suffix = raw.slice(match.index! + match[1].length).trim();
  return { raw, sort, suffix: suffix.length > 0 ? suffix : null };
}

export function parseYear(value: unknown): number | null {
  const text = clean(value);
  if (!text) return null;
  const match = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** First positive integer in the value, e.g. "96 bpm" or "4 verses". */
export function parseCount(value: unknown): number | null {
  const text = clean(value);
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const count = Number.parseInt(match[0], 10);
  return count > 0 ? count : null;
}

export function parseBoolean(value: unknown): boolean {
  const text = clean(value)?.toLowerCase();
  if (!text) return false;
  return ['1', 'true', 'yes', 'y', 'pd', 'public domain'].includes(text);
}
