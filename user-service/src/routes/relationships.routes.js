import express from "express";
import { RelationshipsController } from "../controllers/relationships.controller.js";

const router = express.Router();

// Create relationship: friend/follow/block
router.post("/", RelationshipsController.createRelationship);

// Accept/refuse a request (target accepts user_id)
router.patch("/", RelationshipsController.updateRelationship);

// Delete relationship by user pair
router.delete("/", RelationshipsController.deleteRelationship);

// List friends for a user (status=accepted)
router.get("/friends", RelationshipsController.listFriends);

// List followers for a user
router.get("/followers", RelationshipsController.listFollowers);

// Get relationship between two users (query: userId, targetId)
router.get("/", RelationshipsController.getBetween);

export default router;
