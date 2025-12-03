import express from "express";
import multer from "multer";
import PostServiceController from "./controller.js";

const router = express.Router();

// Multer config để xử lý file upload (cũng parse form-data fields)
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

// Middleware để parse form-data (multipart) hoặc urlencoded
const parseFormData = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('multipart/form-data')) {
    // Dùng multer cho multipart
    upload.any()(req, res, (err) => {
      if (err) return next(err);
      // Chuyển req.files từ array sang đúng format nếu cần
      if (req.files && !Array.isArray(req.files)) {
        req.files = Object.values(req.files).flat();
      }
      next();
    });
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    // Dùng express urlencoded parser
    express.urlencoded({ extended: true })(req, res, next);
  } else if (contentType.includes('application/json')) {
    // Dùng express json parser
    express.json()(req, res, next);
  } else {
    // Mặc định thử parse urlencoded
    express.urlencoded({ extended: true })(req, res, next);
  }
};

// Health check
router.get("/", (req, res) => {
  res.json({ message: "post-aggregation service running" });
});

// ============= POST ROUTES =============
// POST /api/posts - Tạo post mới (với AI moderation)
router.post("/", parseFormData, PostServiceController.createPost);

// GET /api/posts - Lấy danh sách posts
router.get("/", PostServiceController.getPosts);

// GET /api/posts/:id - Lấy chi tiết post
router.get("/:id", PostServiceController.getPostById);

// PATCH /api/posts/:id - Cập nhật post (với AI moderation)
router.patch("/:id", parseFormData, PostServiceController.updatePost);

// DELETE /api/posts/:id - Xóa post
router.delete("/:id", PostServiceController.deletePost);

// ============= COMMENT ROUTES =============
// POST /api/posts/:postId/comments - Tạo comment (với AI moderation)
router.post("/:postId/comments", PostServiceController.createComment);

// GET /api/posts/:postId/comments - Lấy danh sách comments
router.get("/:postId/comments", PostServiceController.getComments);

// PATCH /api/comments/:commentId - Cập nhật comment (với AI moderation)
router.patch("/comments/:commentId", PostServiceController.updateComment);

// DELETE /api/comments/:commentId - Xóa comment
router.delete("/comments/:commentId", PostServiceController.deleteComment);

export default router;
