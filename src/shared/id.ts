// Monotonic, lexicographically-sortable identifiers (ULID).
//
// Time-prefixed ids mean primary keys are roughly insertion-ordered, which:
//   * keeps B-tree inserts append-mostly (less page churn at high write rates),
//   * lets cursor pagination order by `id` alone, and
//   * avoids leaking sequential integer counts to clients.

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const TIME_LEN = 10;
const RAND_LEN = 16;

export function ulid(now: number = Date.now()): string {
  let time = now;
  const out = new Array<string>(TIME_LEN + RAND_LEN);

  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out[i] = ENCODING[time % 32]!;
    time = Math.floor(time / 32);
  }

  const rnd = new Uint8Array(RAND_LEN);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < RAND_LEN; i++) {
    out[TIME_LEN + i] = ENCODING[rnd[i]! % 32]!;
  }

  return out.join("");
}

// Opaque high-entropy token (refresh tokens, OAuth state). URL-safe base64.
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
