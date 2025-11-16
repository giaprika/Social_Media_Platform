import { RelationshipsService } from "../services/relationships.service.js";

export class RelationshipsController {
  static async createRelationship(req, res) {
    try {
      const { user_id, target_id, type } = req.body;
      const rel = await RelationshipsService.createRelationship({
        user_id,
        target_id,
        type,
      });
      res.status(201).json(rel);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async updateRelationship(req, res) {
    try {
      const { user_id, target_id, action } = req.body; // action: 'accept'
      if (!user_id || !target_id || !action)
        return res.status(400).json({ error: "Missing required fields" });
      const result = await RelationshipsService.processAction({
        user_id,
        target_id,
        action,
      });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteRelationship(req, res) {
    try {
      const { user_id, target_id } = req.body;
      if (!user_id || !target_id)
        return res.status(400).json({ error: "Missing user_id or target_id" });
      const deleted = await RelationshipsService.deleteBetweenUsers(
        user_id,
        target_id
      );
      if (!deleted || deleted.length === 0)
        return res.status(404).json({ error: "Relationship not found" });
      res.status(200).json({ message: "Relationship(s) deleted", deleted });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getBetween(req, res) {
    try {
      const { userId, targetId } = req.query;
      if (!userId || !targetId)
        return res
          .status(400)
          .json({ error: "Missing userId or targetId query param" });
      const rel = await RelationshipsService.getRelationshipBetween(
        userId,
        targetId
      );
      if (!rel) return res.status(404).json({ error: "No relationship found" });
      res.status(200).json(rel);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async listFriends(req, res) {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: "Missing userId" });
      const rows = await RelationshipsService.listFriends(userId);
      res.status(200).json(rows);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async listFollowers(req, res) {
    try {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: "Missing userId" });
      const rows = await RelationshipsService.listFollowers(userId);
      res.status(200).json(rows);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}
