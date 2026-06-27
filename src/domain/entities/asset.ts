// Audio asset metadata. The bytes live in R2 (object storage); this row is the
// queryable record of ownership and type.

export type AssetKind = "voice" | "piano" | "chord" | "export";

export const ASSET_KINDS: readonly AssetKind[] = ["voice", "piano", "chord", "export"];

// Browser-recorded audio is webm/opus; rendered exports are wav.
export const ALLOWED_CONTENT_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
]);

export const MAX_ASSET_BYTES = 25 * 1024 * 1024; // 25 MB per upload

export interface Asset {
  id: string;
  userId: string;
  kind: AssetKind;
  contentType: string;
  sizeBytes: number;
  createdAt: number;
}
