// Tiny dependency-free validation helpers. Kept minimal on purpose: zero
// runtime deps means smaller bundles and faster Worker cold starts.

import { AppError } from "./errors.js";

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw AppError.validation("Expected a JSON object body");
  }
  return value as Record<string, unknown>;
}

export function requireString(
  obj: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number } = {},
): string {
  const v = obj[key];
  if (typeof v !== "string") throw AppError.validation(`"${key}" must be a string`);
  const trimmed = v.trim();
  if (opts.min !== undefined && trimmed.length < opts.min)
    throw AppError.validation(`"${key}" must be at least ${opts.min} chars`);
  if (opts.max !== undefined && trimmed.length > opts.max)
    throw AppError.validation(`"${key}" must be at most ${opts.max} chars`);
  return trimmed;
}

export function optionalString(
  obj: Record<string, unknown>,
  key: string,
  opts: { max?: number } = {},
): string | undefined {
  if (obj[key] === undefined || obj[key] === null) return undefined;
  return requireString(obj, key, opts);
}

export function intInRange(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback?: number,
): number {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw AppError.validation(`"${key}" is required`);
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max)
    throw AppError.validation(`"${key}" must be between ${min} and ${max}`);
  return Math.trunc(n);
}

export function oneOf<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw AppError.validation(`"${key}" is required`);
  }
  if (typeof v !== "string" || !allowed.includes(v as T))
    throw AppError.validation(`"${key}" must be one of: ${allowed.join(", ")}`);
  return v as T;
}
