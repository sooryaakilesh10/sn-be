import type { RequestContext } from "../context.js";
import { requireViewer } from "../context.js";
import { json, noContent } from "../response.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { ASSET_KINDS, MAX_ASSET_BYTES, type AssetKind } from "../../../domain/entities/asset.js";
import { AppError } from "../../../shared/errors.js";

export const assetController = {
  // POST /api/assets?kind=voice — raw audio in the request body. Content-Type
  // header carries the MIME type. Kept as a raw upload (not multipart) so we can
  // stream straight into R2 without buffering form fields.
  async upload(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await enforceRateLimit(c, c.services.rateLimiter, {
      bucket: "asset-upload",
      limit: 30,
      windowSeconds: 60,
    });

    const kind = c.url.searchParams.get("kind") as AssetKind | null;
    if (!kind || !ASSET_KINDS.includes(kind)) {
      throw AppError.badRequest(`kind must be one of: ${ASSET_KINDS.join(", ")}`);
    }
    const contentType = c.req.headers.get("content-type") ?? "";

    const declared = Number(c.req.headers.get("content-length") ?? 0);
    if (declared > MAX_ASSET_BYTES) throw AppError.badRequest("Audio exceeds the 25 MB limit");

    const body = await c.req.arrayBuffer();
    const asset = await c.services.assets.upload(viewer.sub, { kind, contentType, body });
    return json({ asset }, { status: 201 });
  },

  // GET /api/assets/:id — stream audio from R2 (public, long-cacheable).
  async download(c: RequestContext): Promise<Response> {
    const object = await c.services.assets.download(c.params.id!);
    return new Response(object.body, {
      headers: {
        "content-type": object.contentType,
        "content-length": String(object.sizeBytes),
        etag: object.etag,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  },

  // DELETE /api/assets/:id
  async remove(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await c.services.assets.delete(viewer.sub, c.params.id!);
    return noContent();
  },
};
