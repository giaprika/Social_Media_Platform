import express from "express";
import UserServiceController from "./controller.js";
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "user-service running" });
});

router.post("/logining", UserServiceController.login);
router.post("/registering", UserServiceController.register);
router.post("/refresh-token", UserServiceController.refreshToken);

router.post("/gg-logining", UserServiceController.ggLogin);
router.post("/gg-registering", UserServiceController.ggRegistering);

export default router;
