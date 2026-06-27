import { Router } from "./router.js";
import { authController } from "./controllers/authController.js";
import { beatController } from "./controllers/beatController.js";
import { feedController } from "./controllers/feedController.js";
import { socialController } from "./controllers/socialController.js";
import { userController } from "./controllers/userController.js";
import { assetController } from "./controllers/assetController.js";
import { json } from "./response.js";

// Single source of truth for the HTTP surface. Built once and reused across
// requests (the Router holds no per-request state).
export function buildRouter(): Router {
  const r = new Router();

  // Health / readiness
  r.get("/health", () => json({ status: "ok" }));

  // --- Auth (Google OAuth + JWT sessions) ---
  r.get("/auth/google/start", authController.start);
  r.get("/auth/google/callback", authController.callback);
  r.post("/auth/refresh", authController.refresh);
  r.post("/auth/logout", authController.logout);

  // --- Current user ---
  r.get("/api/me", userController.me);
  r.patch("/api/me", userController.updateMe);
  r.get("/api/me/beats", beatController.listMine);
  r.get("/api/me/following", socialController.following);

  // --- Beats (projects) ---
  r.post("/api/beats", beatController.create);
  r.get("/api/beats/:id", beatController.get);
  r.put("/api/beats/:id", beatController.update);
  r.delete("/api/beats/:id", beatController.remove);
  r.post("/api/beats/:id/play", beatController.play);
  r.post("/api/beats/:id/like", socialController.like);
  r.delete("/api/beats/:id/like", socialController.unlike);

  // --- Discover feed ---
  r.get("/api/feed", feedController.discover);

  // --- Users / social ---
  r.get("/api/users/:username", userController.profile);
  r.post("/api/users/:id/follow", socialController.follow);
  r.delete("/api/users/:id/follow", socialController.unfollow);

  // --- Audio assets ---
  r.post("/api/assets", assetController.upload);
  r.get("/api/assets/:id", assetController.download);
  r.delete("/api/assets/:id", assetController.remove);

  return r;
}
