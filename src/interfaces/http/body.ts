import { AppError } from "../../shared/errors.js";

const MAX_JSON_BYTES = 1024 * 1024; // 1 MB — beat documents can be large but bounded

export async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw AppError.badRequest("Expected application/json body");
  }
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw AppError.badRequest("Request body too large");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw AppError.badRequest("Invalid JSON body");
  }
}
