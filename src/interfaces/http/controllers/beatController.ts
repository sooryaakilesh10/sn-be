import type { RequestContext } from "../context.js";
import { requireViewer } from "../context.js";
import { json, noContent } from "../response.js";
import { readJson } from "../body.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { parseLimit, decodeCursor } from "../../../shared/pagination.js";
import { GENRES, VISIBILITIES } from "../../../domain/entities/beat.js";
import {
  asObject,
  requireString,
  optionalString,
  intInRange,
  oneOf,
} from "../../../shared/validation.js";
import { AppError } from "../../../shared/errors.js";
import type { CreateBeatInput, UpdateBeatInput } from "../../../application/services/beatService.js";

export const beatController = {
  // POST /api/beats — save a new creation.
  async create(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await enforceRateLimit(c, c.services.rateLimiter, {
      bucket: "beat-write",
      limit: 60,
      windowSeconds: 60,
    });
    const body = asObject(await readJson(c.req));

    const input: CreateBeatInput = {
      title: requireString(body, "title", { min: 1, max: 120 }),
      genre: oneOf(body, "genre", GENRES, "trap"),
      mood: optionalString(body, "mood", { max: 40 }) ?? "custom",
      bpm: intInRange(body, "bpm", 40, 300, 120),
      visibility: oneOf(body, "visibility", VISIBILITIES, "private"),
      remixOf: optionalString(body, "remixOf") ?? null,
      document: requireDocument(body),
    };

    const beat = await c.services.beats.create(viewer.sub, input);
    return json({ beat }, { status: 201 });
  },

  // GET /api/beats/:id — full beat (with document) for loading into the editor.
  async get(c: RequestContext): Promise<Response> {
    const beat = await c.services.beats.getForEdit(c.viewer?.sub ?? null, c.params.id!);
    return json({ beat });
  },

  // PUT /api/beats/:id — update title/visibility/document/etc.
  async update(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await enforceRateLimit(c, c.services.rateLimiter, {
      bucket: "beat-write",
      limit: 120,
      windowSeconds: 60,
    });
    const body = asObject(await readJson(c.req));

    const input: UpdateBeatInput = {};
    if (body.title !== undefined) input.title = requireString(body, "title", { min: 1, max: 120 });
    if (body.genre !== undefined) input.genre = oneOf(body, "genre", GENRES);
    if (body.mood !== undefined) input.mood = requireString(body, "mood", { max: 40 });
    if (body.bpm !== undefined) input.bpm = intInRange(body, "bpm", 40, 300);
    if (body.visibility !== undefined) input.visibility = oneOf(body, "visibility", VISIBILITIES);
    if (body.document !== undefined) input.document = requireDocument(body);

    const beat = await c.services.beats.update(viewer.sub, c.params.id!, input);
    return json({ beat });
  },

  // DELETE /api/beats/:id
  async remove(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await c.services.beats.delete(viewer.sub, c.params.id!);
    return noContent();
  },

  // GET /api/me/beats — the signed-in user's saved feed.
  async listMine(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const limit = parseLimit(c.url.searchParams.get("limit"));
    const cursor = decodeCursor(c.url.searchParams.get("cursor"));
    const page = await c.services.beats.listMine(viewer.sub, cursor, limit);
    return json(page);
  },

  // POST /api/beats/:id/play — fire-and-forget play counter.
  async play(c: RequestContext): Promise<Response> {
    await c.services.beats.registerPlay(c.params.id!);
    return noContent();
  },
};

function requireDocument(body: Record<string, unknown>): Record<string, unknown> {
  const doc = body.document;
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw AppError.validation('"document" must be an object');
  }
  return doc as Record<string, unknown>;
}
