import express from "express";
import multer from "multer";
import PostServiceController from "./controller.js";

const router = express.Router();

// Multer config để xử lý file upload
const upload = multer({
  storage: multer.memoryStorage(), // Lưu file vào memory buffer
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Chỉ accept image và video
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images and videos are allowed"));
    }
  },
});

// Health check
router.get("/", (req, res) => {
  res.json({ message: "post-aggregation service running" });
});

// ============= POST ROUTES =============
// POST /api/posts - Tạo post mới (với AI moderation)
router.post("/", upload.array("files", 10), PostServiceController.createPost);

// GET /api/posts - Lấy danh sách posts
router.get("/", PostServiceController.getPosts);

// GET /api/posts/:id - Lấy chi tiết post
router.get("/:id", PostServiceController.getPostById);

// PATCH /api/posts/:id - Cập nhật post (với AI moderation)
router.patch("/:id", upload.array("files", 10), PostServiceController.updatePost);

// DELETE /api/posts/:id - Xóa post
router.delete("/:id", PostServiceController.deletePost);

export default router;
