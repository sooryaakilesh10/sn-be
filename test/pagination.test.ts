import { describe, it, expect } from "vitest";
import {
  parseLimit,
  decodeCursor,
  encodeCursor,
  buildPage,
} from "../src/shared/pagination.js";

describe("pagination", () => {
  it("clamps limit to sane bounds", () => {
    expect(parseLimit(null)).toBe(20);
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit("9999")).toBe(50);
    expect(parseLimit("-1")).toBe(20);
    expect(parseLimit("abc")).toBe(20);
  });

  it("round-trips a cursor", () => {
    const encoded = encodeCursor("beat-123");
    expect(decodeCursor(encoded)).toBe("beat-123");
  });

  it("treats a malformed cursor as the first page", () => {
    // base64 of "@@@" is not how we encode; ensure no throw
    expect(() => decodeCursor("!!!not-base64!!!")).not.toThrow();
  });

  it("returns no nextCursor when the page is not full", () => {
    const page = buildPage([{ id: "a" }, { id: "b" }], 5, (r) => r.id);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("emits a nextCursor when there is an extra row", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const page = buildPage(rows, 2, (r) => r.id);
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe(encodeCursor("b"));
  });
});
