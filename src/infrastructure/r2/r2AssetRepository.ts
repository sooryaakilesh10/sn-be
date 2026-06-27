import type {
  AssetRepository,
  NewAsset,
  StoredObject,
} from "../../domain/repositories/assetRepository.js";
import type { Asset } from "../../domain/entities/asset.js";
import { mapAsset, type AssetRow } from "../d1/mappers.js";

// Stores audio bytes in R2 and the metadata row in D1, keyed by the same id.
// R2 gives effectively unbounded storage and cacheable reads; D1 keeps the
// small, queryable ownership record.
export class R2AssetRepository implements AssetRepository {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly db: D1Database,
  ) {}

  async put(asset: NewAsset): Promise<Asset> {
    await this.bucket.put(asset.id, asset.body, {
      httpMetadata: { contentType: asset.contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    const now = Date.now();
    const size = asset.body.byteLength;
    await this.db
      .prepare(
        `INSERT INTO assets (id, user_id, kind, content_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(asset.id, asset.userId, asset.kind, asset.contentType, size, now)
      .run();
    return {
      id: asset.id,
      userId: asset.userId,
      kind: asset.kind,
      contentType: asset.contentType,
      sizeBytes: size,
      createdAt: now,
    };
  }

  async findById(id: string): Promise<Asset | null> {
    const row = await this.db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .bind(id)
      .first<AssetRow>();
    return row ? mapAsset(row) : null;
  }

  async getObject(id: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(id);
    if (!object) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      sizeBytes: object.size,
      etag: object.httpEtag,
    };
  }

  async delete(id: string): Promise<void> {
    await this.bucket.delete(id);
    await this.db.prepare("DELETE FROM assets WHERE id = ?").bind(id).run();
  }
}
