import { describe, it, expect } from "vitest";
import { JwtTokenSigner } from "../src/infrastructure/auth/jwtTokenSigner.js";

describe("JwtTokenSigner", () => {
  const signer = new JwtTokenSigner("test-secret-key");

  it("signs and verifies a token round-trip", async () => {
    const token = await signer.sign({ sub: "user-1", username: "alice" }, 60);
    const claims = await signer.verify(token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe("user-1");
    expect(claims!.username).toBe("alice");
  });

  it("rejects a tampered token", async () => {
    const token = await signer.sign({ sub: "user-1", username: "alice" }, 60);
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");
    expect(await signer.verify(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signer.sign({ sub: "user-1", username: "alice" }, 60);
    const other = new JwtTokenSigner("different-secret");
    expect(await other.verify(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signer.sign({ sub: "user-1", username: "alice" }, -1);
    expect(await signer.verify(token)).toBeNull();
  });

  it("rejects malformed input", async () => {
    expect(await signer.verify("not-a-jwt")).toBeNull();
    expect(await signer.verify("")).toBeNull();
  });
});
