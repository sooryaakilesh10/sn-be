import type { AssetRepository, StoredObject } from "../../domain/repositories/assetRepository.js";
import type { Asset, AssetKind } from "../../domain/entities/asset.js";
import { ALLOWED_CONTENT_TYPES, MAX_ASSET_BYTES } from "../../domain/entities/asset.js";
import { AppError } from "../../shared/errors.js";
import { ulid } from "../../shared/id.js";

export interface UploadInput {
  kind: AssetKind;
  contentType: string;
  body: ArrayBuffer;
}

// Audio uploads. Bytes go to R2 (CDN-scale, unmetered egress to Workers); only
// a small metadata row is kept relationally for ownership and listing.
export class AssetService {
  constructor(private readonly assets: AssetRepository) {}

  async upload(viewerId: string, input: UploadInput): Promise<Asset> {
    if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
      throw AppError.badRequest(`Unsupported audio type: ${input.contentType}`);
    }
    if (input.body.byteLength === 0) throw AppError.badRequest("Empty upload");
    if (input.body.byteLength > MAX_ASSET_BYTES) {
      throw AppError.badRequest("Audio exceeds the 25 MB limit");
    }
    return this.assets.put({
      id: ulid(),
      userId: viewerId,
      kind: input.kind,
      contentType: input.contentType,
      body: input.body,
    });
  }

  // Public read — audio is shared content. Streamed straight from R2.
  async download(id: string): Promise<StoredObject> {
    const object = await this.assets.getObject(id);
    if (!object) throw AppError.notFound("Asset not found");
    return object;
  }

  async delete(viewerId: string, id: string): Promise<void> {
    const meta = await this.assets.findById(id);
    if (!meta) throw AppError.notFound("Asset not found");
    if (meta.userId !== viewerId) throw AppError.forbidden();
    await this.assets.delete(id);
  }
}
