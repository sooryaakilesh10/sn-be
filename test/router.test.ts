import { describe, it, expect } from "vitest";
import { Router } from "../src/interfaces/http/router.js";
import { AppError } from "../src/shared/errors.js";

const noop = () => new Response(null);

describe("Router", () => {
  it("matches static routes by method", () => {
    const r = new Router().get("/api/feed", noop);
    const m = r.match("GET", "/api/feed");
    expect(m.params).toEqual({});
  });

  it("extracts path params", () => {
    const r = new Router().get("/api/beats/:id/like", noop);
    const m = r.match("GET", "/api/beats/abc123/like");
    expect(m.params.id).toBe("abc123");
  });

  it("url-decodes params", () => {
    const r = new Router().get("/api/users/:username", noop);
    const m = r.match("GET", "/api/users/cool%20name");
    expect(m.params.username).toBe("cool name");
  });

  it("throws 404 for unknown paths", () => {
    const r = new Router().get("/api/feed", noop);
    expect(() => r.match("GET", "/nope")).toThrow(AppError);
    try {
      r.match("GET", "/nope");
    } catch (e) {
      expect((e as AppError).status).toBe(404);
    }
  });

  it("throws 405 for known path, wrong method", () => {
    const r = new Router().get("/api/feed", noop);
    try {
      r.match("POST", "/api/feed");
    } catch (e) {
      expect((e as AppError).status).toBe(400); // method-not-allowed mapped to bad request
    }
  });

  it("does not confuse routes of different segment counts", () => {
    const r = new Router().get("/api/beats/:id", noop).get("/api/beats/:id/like", noop);
    expect(r.match("GET", "/api/beats/x").params).toEqual({ id: "x" });
    expect(r.match("GET", "/api/beats/x/like").params).toEqual({ id: "x" });
  });
});
