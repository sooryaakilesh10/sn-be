import { describe, it, expect } from "vitest";
import { challengeForTimestamp } from "../src/domain/challenges/catalog.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("challenge catalog", () => {
  it("is deterministic for a given UTC day", () => {
    const morning = Date.parse("2026-07-02T06:00:00Z");
    const evening = Date.parse("2026-07-02T21:30:00Z");
    const a = challengeForTimestamp(morning);
    const b = challengeForTimestamp(evening);
    expect(a).toEqual(b);
    expect(a.id).toBe("2026-07-02");
    expect(a.date).toBe("2026-07-02");
  });

  it("frames the challenge to the UTC day boundaries", () => {
    const now = Date.parse("2026-07-02T12:00:00Z");
    const c = challengeForTimestamp(now);
    expect(c.startsAt).toBe(Date.parse("2026-07-02T00:00:00Z"));
    expect(c.endsAt).toBe(c.startsAt + DAY_MS);
    expect(now).toBeGreaterThanOrEqual(c.startsAt);
    expect(now).toBeLessThan(c.endsAt);
  });

  it("rotates to a different prompt across consecutive days", () => {
    const day1 = challengeForTimestamp(Date.parse("2026-07-02T00:00:00Z"));
    const day2 = challengeForTimestamp(Date.parse("2026-07-03T00:00:00Z"));
    expect(day2.id).not.toBe(day1.id);
    // Adjacent days draw different templates (pool has > 1 entry).
    expect(day2.title).not.toBe(day1.title);
  });

  it("always yields a well-formed challenge", () => {
    const c = challengeForTimestamp(Date.parse("2026-01-15T09:00:00Z"));
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.prompt.length).toBeGreaterThan(0);
    expect(Array.isArray(c.rules)).toBe(true);
    expect(c.emoji.length).toBeGreaterThan(0);
  });
});
