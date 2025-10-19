import express from "express";
import { UserController } from "../controllers/user.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "user-service running" });
});

// Routes không cần xác thực
router.post("/register", UserController.createUser);
router.post("/validate", UserController.validateUser);
router.post("/login", UserController.loginUser);
router.delete("/deleteUser/:id", UserController.deleteUser);
router.post("/saveRefreshToken", UserController.saveRefreshToken);

// Routes cần xác thực (từ gateway)
router.get("/me", authenticate, UserController.getUserById);

export default router;
