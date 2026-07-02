// The daily challenge catalog.
//
// The platform "releases" one challenge per UTC day. Rather than run a
// scheduler and store a row, we DERIVE the challenge from the date: the day
// number since the epoch indexes into a curated, hand-authored pool. This is
// pure and total — any isolate, at any time, computes the same challenge for a
// given day, and back-dated leaderboards stay reproducible forever.

import type { Challenge } from "../entities/challenge.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// A challenge template (the date-dependent fields are filled in per day).
interface Template {
  title: string;
  prompt: string;
  rules: string[];
  bpm: number | null;
  bars: number | null;
  emoji: string;
}

// Curated pool. Rotates deterministically; add to the end freely — existing
// past challenges keep resolving to the same template as long as ordering and
// length stay stable for the days already elapsed. (In practice this only
// affects the fixed set of past days if the array shrinks, so only append.)
const POOL: readonly Template[] = [
  {
    title: "Kick & Bass Only",
    prompt: "Create a beat using only the Kick and Bass tracks.",
    rules: ["Only Kick + Bass", "Mute everything else"],
    bpm: null,
    bars: null,
    emoji: "🥁",
  },
  {
    title: "90 BPM Lofi",
    prompt: "Make a laid-back lofi loop locked to 90 BPM.",
    rules: ["Exactly 90 BPM", "Lofi mood"],
    bpm: 90,
    bars: null,
    emoji: "🎧",
  },
  {
    title: "8 Bars Only",
    prompt: "Say it in 8 bars — one tight, complete idea.",
    rules: ["8 bars max", "No filler"],
    bpm: null,
    bars: 8,
    emoji: "📏",
  },
  {
    title: "Summer Vibes",
    prompt: "Bottle a summer afternoon into a single beat.",
    rules: ["Bright & warm", "Feel-good energy"],
    bpm: null,
    bars: null,
    emoji: "🌴",
  },
  {
    title: "Trap Bangers",
    prompt: "Hard-hitting trap — rolling hats and booming 808s.",
    rules: ["Trap genre", "Heavy 808s"],
    bpm: 140,
    bars: null,
    emoji: "🔥",
  },
  {
    title: "One-Finger Melody",
    prompt: "Write a melody a single finger could play — keep it simple.",
    rules: ["One note at a time", "Melody-led"],
    bpm: null,
    bars: null,
    emoji: "🎹",
  },
  {
    title: "Midnight House",
    prompt: "Four-on-the-floor house for 2am on the dancefloor.",
    rules: ["Steady 4/4 kick", "House groove"],
    bpm: 124,
    bars: null,
    emoji: "🌙",
  },
  {
    title: "Ambient Textures",
    prompt: "No drums — build a mood from pads and space alone.",
    rules: ["No drum tracks", "Ambient / cinematic"],
    bpm: null,
    bars: null,
    emoji: "🌫️",
  },
];

// Whole days elapsed since the Unix epoch (UTC). Stable index into the pool.
function dayNumber(now: number): number {
  return Math.floor(now / DAY_MS);
}

// "YYYY-MM-DD" for the UTC day containing `now`.
function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// The challenge for the UTC day containing `now`.
export function challengeForTimestamp(now: number): Challenge {
  const dayNo = dayNumber(now);
  const template = POOL[((dayNo % POOL.length) + POOL.length) % POOL.length]!;
  const startsAt = dayNo * DAY_MS;
  return {
    id: dayKey(now),
    date: dayKey(now),
    title: template.title,
    prompt: template.prompt,
    rules: template.rules,
    bpm: template.bpm,
    bars: template.bars,
    emoji: template.emoji,
    startsAt,
    endsAt: startsAt + DAY_MS,
  };
}
