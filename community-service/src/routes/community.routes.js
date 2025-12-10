import express from "express";
import { CommunityController } from "../controllers/community.controller.js";

const router = express.Router();

// Discovery Routes (must be before /:id routes to avoid conflicts)
router.get("/", CommunityController.getCommunities);
router.get("/search", CommunityController.searchCommunities);
router.get("/categories", CommunityController.getCategories);

// Single Community Routes
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
