// Cursor pagination. We never use OFFSET — latency must stay flat regardless of
// how deep into a list a client scrolls. The cursor is just the opaque id of
// the last row seen, base64url-wrapped so clients treat it as opaque.

import { base64UrlEncode } from "./id.js";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function parseLimit(raw: string | null): number {
  const n = raw ? Number(raw) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

export function decodeCursor(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null; // malformed cursor → treat as first page
  }
}

export function encodeCursor(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

// Fetch `limit + 1` rows in the repository; pass the slice here to compute the
// next cursor without a second count query.
export function buildPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => string,
): Page<T> {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1]!;
  return { items, nextCursor: encodeCursor(cursorOf(last)) };
}
