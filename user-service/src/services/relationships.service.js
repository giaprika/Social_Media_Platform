import { v4 as uuidv4 } from "uuid";
import { RelationshipsRepository } from "../repositories/relationships.repository.js";

export class RelationshipsService {
  static async createRelationship({ user_id, target_id, type }) {
    if (!user_id || !target_id || !type) {
      throw new Error("Missing required fields: user_id, target_id, type");
    }
    if (user_id === target_id) {
      throw new Error("Cannot create relationship with self.");
    }

    const existing = await RelationshipsRepository.findBetween(
      user_id,
      target_id
    );

    // For friend: create pending, or accept when reciprocal pending exists
    if (type === "friend") {
      if (existing) {
        if (existing.type === "friend") {
          if (existing.status === "pending" && existing.user_id !== user_id) {
            // The other user previously sent a request -> accept it
            return await RelationshipsRepository.updateStatus(
              existing.id,
              "accepted"
            );
          }
          throw new Error(
            "Friend request already exists or you are already friends."
          );
        }
        if (existing.type === "block") {
          throw new Error("Cannot send friend request: user is blocked.");
        }
        // different type exists (e.g., follow) -> allow friend request as new record
      }

      const id = uuidv4();
      const status = "pending";
      return await RelationshipsRepository.insertRelationship({
        id,
        user_id,
        target_id,
        type: "friend",
        status,
      });
    }

    if (type === "follow") {
      if (existing && existing.type === "follow") {
        // already following (either direction) — treat as idempotent
        return existing;
      }
      if (existing && existing.type === "block") {
        throw new Error("Cannot follow: user is blocked.");
      }
      const id = uuidv4();
      const status = "accepted"; // follow is one-way and considered accepted
      return await RelationshipsRepository.insertRelationship({
        id,
        user_id,
        target_id,
        type: "follow",
        status,
      });
    }

    if (type === "block") {
      // when blocking, remove existing friend/follow relationships between users
      if (existing) {
        if (existing.type !== "block") {
          await RelationshipsRepository.deleteBetween(user_id, target_id);
        }
        return existing;
      }
      const id = uuidv4();
      const status = "accepted";
      return await RelationshipsRepository.insertRelationship({
        id,
        user_id,
        target_id,
        type: "block",
        status,
      });
    }

    throw new Error("Invalid relationship type");
  }

  static async processAction({ user_id, target_id, action }) {
    // action: 'accept'
    const rel = await RelationshipsRepository.findBetween(user_id, target_id);
    if (!rel) throw new Error("Relationship not found");
    // only allow accepting when type is friend and status is pending
    if (action === "accept") {
      if (rel.type !== "friend")
        throw new Error("Only friend requests can be accepted");
      if (rel.status === "accepted")
        throw new Error("Friend request already accepted");
      return await RelationshipsRepository.updateStatus(rel.id, "accepted");
    }

    if (action === "refuse") {
      // refuse -> delete the pending request
      await RelationshipsRepository.deleteBetween(user_id, target_id);
      return { message: "Request refused" };
    }

    throw new Error("Invalid action");
  }

  static async deleteBetweenUsers(userId, targetId) {
    return await RelationshipsRepository.deleteBetween(userId, targetId);
  }

  static async getRelationshipBetween(userId, targetId) {
    return await RelationshipsRepository.findBetween(userId, targetId);
  }

  static async listFriends(userId) {
    return await RelationshipsRepository.listFriends(userId);
  }

  static async listFollowers(userId) {
    return await RelationshipsRepository.listFollowers(userId);
  }
}
