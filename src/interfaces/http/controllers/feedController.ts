import type { RequestContext } from "../context.js";
import { json } from "../response.js";
import { parseLimit, decodeCursor } from "../../../shared/pagination.js";
import { GENRES, type Genre } from "../../../domain/entities/beat.js";
import type { FeedSort } from "../../../domain/repositories/beatRepository.js";

export const feedController = {
  // GET /api/feed?sort=recent|top&genre=trap&cursor=&limit=
  // Public; personalizes `likedByViewer` when a session cookie is present.
  async discover(c: RequestContext): Promise<Response> {
    const sort: FeedSort = c.url.searchParams.get("sort") === "top" ? "top" : "recent";
    const genreParam = c.url.searchParams.get("genre");
    const genre = GENRES.includes(genreParam as Genre) ? (genreParam as Genre) : undefined;

    const page = await c.services.feed.discover({
      sort,
      genre,
      cursor: decodeCursor(c.url.searchParams.get("cursor")),
      limit: parseLimit(c.url.searchParams.get("limit")),
      viewerId: c.viewer?.sub ?? null,
    });
    return json(page);
  },
};
