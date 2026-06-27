import type { Asset, AssetKind } from "../entities/asset.js";

export interface NewAsset {
  id: string;
  userId: string;
  kind: AssetKind;
  contentType: string;
  body: ArrayBuffer;
}

export interface StoredObject {
  body: ReadableStream;
  contentType: string;
  sizeBytes: number;
  etag: string;
}

// Combines object storage (R2) with the metadata row so the service layer sees
// a single port. Implementations keep the two in sync.
export interface AssetRepository {
  put(asset: NewAsset): Promise<Asset>;
  findById(id: string): Promise<Asset | null>;
  getObject(id: string): Promise<StoredObject | null>;
  delete(id: string): Promise<void>;
}
