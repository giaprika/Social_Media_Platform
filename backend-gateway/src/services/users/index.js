import express from "express";
import UserServiceController from "./controller.js";
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "user-service running" });
});

router.post("/login", UserServiceController.login);
router.post("/register", UserServiceController.register);
router.post("/refresh-token", UserServiceController.refreshToken);

export default router;
