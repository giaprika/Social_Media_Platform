import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import userRoutes from "./src/routes/notification.routes.js";

const app = express();

app.use(
  cors({
    origin: "http://localhost:3000", // cho phép React gọi
    credentials: true,
  })
);

// Middleware
// app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/notifications", userRoutes);

// Middleware xử lý lỗi
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Lỗi server",
    error: err.stack,
  });
});

// Route 404
app.use((req, res) => {
  res.status(404).json({ message: "API không tồn tại" });
});

export default app;
