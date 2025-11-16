import express from "express";
import { UserController } from "../controllers/user.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "user-service running" });
});

// Routes không cần xác thực
router.post("/", UserController.createUser);
router.post("/validation", UserController.validateUser);
router.post("/logining", UserController.loginUser);
router.delete("/:id", UserController.deleteUser);
router.post("/refresh-token", UserController.saveRefreshToken);

// Routes cần xác thực (từ gateway)
router.get("/me", authenticate, UserController.getUserById);

export default router;
