import express from "express";
import { UserController } from "../controllers/user.controller.js";

const router = express.Router();

// Routes không cần xác thực
router.post("/", UserController.createUser);
router.post("/validation", UserController.validateUser);
router.post("/logining", UserController.loginUser);
router.post("/refresh-token", UserController.saveRefreshToken);
router.get("/", UserController.searchUsers);
router.get("/me", UserController.getUserById);
router.get("/:id/stats", UserController.getUserStats);
router.get("/:id/settings", UserController.getUserSettings);
router.get("/:id", UserController.getUserByIdPublic);

// Routes cần xác thực (nên thêm middleware sau)
// Đặt routes cụ thể trước routes generic để tránh conflict
router.patch("/:id/settings", UserController.updateUserSettings);
router.patch("/:id/password", UserController.updatePassword);
router.patch("/:id/status", UserController.updateUserStatus);
router.patch("/:id", UserController.updateUser);
router.delete("/:id", UserController.deleteUser);

export default router;
