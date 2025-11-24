import express from "express";
import { CommunityController } from "../controllers/community.controller.js";

const router = express.Router();

// Communities
router.post("/", CommunityController.createCommunity);
router.get("/:id", CommunityController.getCommunityById);
router.get("/slug/:slug", CommunityController.getCommunityBySlug);
router.patch("/:id", CommunityController.updateCommunity);
router.delete("/:id", CommunityController.deleteCommunity);

// Pinned Posts
router.get("/:id/pinned-posts", CommunityController.getPinnedPosts);
router.post("/:id/pinned-posts", CommunityController.pinPost);
router.delete("/:id/pinned-posts/:postId", CommunityController.unpinPost);

export default router;

