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
router.get("/u/:username", UserController.getUserByUsername);
router.get("/:id/stats", UserController.getUserStats);
router.get("/:id/settings", UserController.getUserSettings);
router.get("/:id", UserController.getUserByIdPublic);

router.post("/gg-logining", UserController.googleLogin);
router.post("/gg-registering", UserController.googleRegister);

// Routes cần xác thực (nên thêm middleware sau)
// Đặt routes cụ thể trước routes generic để tránh conflict

// Follow/Unfollow routes
router.get("/follow/:targetId/status", UserController.checkFollowStatus);
router.post("/follow/:targetId", UserController.followUser);
router.delete("/follow/:targetId", UserController.unfollowUser);

router.patch("/:id/settings", UserController.updateUserSettings);
router.patch("/:id/password", UserController.updatePassword);
router.patch("/:id/status", UserController.updateUserStatus);
router.patch("/:id", UserController.updateUser);
router.delete("/:id", UserController.deleteUser);

export default router;
