import express from "express";
import { UserController } from "../controllers/user.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Routes không cần xác thực
router.post("/", UserController.createUser);
router.post("/validation", UserController.validateUser);
router.post("/logining", UserController.loginUser);
router.post("/refresh-token", UserController.saveRefreshToken);
router.get("/", UserController.searchUsers);
router.get("/:id", UserController.getUserByIdPublic);
router.delete("/:id", UserController.deleteUser);

// Routes cần xác thực (từ gateway)
router.get("/me", authenticate, UserController.getUserById);

export default router;
