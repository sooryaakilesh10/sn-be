// Daily Beat Challenge.
//
// A challenge is the platform's daily prompt ("Kick & Bass only", "90 BPM
// Lofi", "8 bars only", …). It is not persisted: `challengeForTimestamp` in
// domain/challenges/catalog.ts derives it deterministically from the UTC date,
// so every request agrees on today's challenge without a scheduler. What IS
// persisted is a user's ENTRY: a beat they submitted to a given day.

import type { BeatView } from "./beat.js";

// The daily prompt itself (computed, never stored).
export interface Challenge {
  id: string;          // UTC day key, e.g. "2026-07-02"
  date: string;        // same as id, kept explicit for clients
  title: string;       // short headline, e.g. "Kick & Bass Only"
  prompt: string;      // the brief, e.g. "Create a beat using only Kick and Bass."
  rules: string[];     // bullet constraints shown as chips
  // Optional hard constraints the prompt implies (null = free choice).
  bpm: number | null;  // suggested/required tempo
  bars: number | null; // suggested/required length in bars
  emoji: string;       // decorative badge for the card
  startsAt: number;    // ms epoch — start of the UTC day
  endsAt: number;      // ms epoch — when submissions close (next UTC midnight)
}

// A persisted submission (row in challenge_entries).
export interface ChallengeEntry {
  id: string;
  challengeId: string;
  userId: string;
  beatId: string;
  likesCount: number;
  createdAt: number;
}

// A leaderboard row: the submitted beat plus its challenge-specific standing.
export interface ChallengeEntryView {
  entryId: string;
  challengeId: string;
  rank: number;              // 1-based position on the leaderboard
  entryLikes: number;        // likes earned FOR THIS CHALLENGE (not the beat's own)
  likedByViewer: boolean;    // did the viewer like this entry
  isOwn: boolean;            // is this the viewer's own submission
  submittedAt: number;
  beat: BeatView;            // the submitted creation (author embedded)
}

// Today's challenge plus the viewer's context.
export interface ChallengeView {
  id: string;
  date: string;
  title: string;
  prompt: string;
  rules: string[];
  bpm: number | null;
  bars: number | null;
  emoji: string;
  startsAt: number;
  endsAt: number;
  entryCount: number;                       // total submissions today
  viewerEntry: ChallengeEntryView | null;   // the viewer's own submission, if any
}
