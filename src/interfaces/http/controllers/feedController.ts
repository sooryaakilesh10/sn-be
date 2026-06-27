import type { RequestContext } from "../context.js";
import { json } from "../response.js";
import { parseLimit, decodeCursor } from "../../../shared/pagination.js";
import { GENRES, type Genre } from "../../../domain/entities/beat.js";
import type { FeedSort } from "../../../domain/repositories/beatRepository.js";

export const feedController = {
  // GET /api/feed?sort=foryou|following|recent|top&genre=trap&cursor=&limit=
  // Public; personalizes `likedByViewer` when a session cookie is present.
  // "foryou" (personalized ranking) and "following" (friends' posts) use the
  // session when present and return an empty feed when signed out.
  async discover(c: RequestContext): Promise<Response> {
    const sortParam = c.url.searchParams.get("sort");
    const genreParam = c.url.searchParams.get("genre");
    const genre = GENRES.includes(genreParam as Genre) ? (genreParam as Genre) : undefined;

    const base = {
      genre,
      cursor: decodeCursor(c.url.searchParams.get("cursor")),
      limit: parseLimit(c.url.searchParams.get("limit")),
      viewerId: c.viewer?.sub ?? null,
    };

    let page;
    if (sortParam === "following") {
      page = await c.services.feed.following({ ...base, sort: "recent" });
    } else if (sortParam === "foryou") {
      page = await c.services.feed.forYou({ ...base, sort: "recent" });
    } else {
      const sort: FeedSort = sortParam === "top" ? "top" : "recent";
      page = await c.services.feed.discover({ ...base, sort });
    }
    return json(page);
  },
};
