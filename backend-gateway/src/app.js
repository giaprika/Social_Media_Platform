import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import logger from "./utils/logger.js";
import router from "./routes/v1.js";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import fileupload from "express-fileupload";

// Load environment variables
dotenv.config();

const app = express();
// Middleware
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const corsOptions = {
  origin: function (origin, callback) {
    // Cho phép request từ Postman hoặc môi trường không có origin
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-correlation-id",
    "x-user-id",
  ],
};

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

// Static files
app.use(express.static("public"));

// Cookie parser
app.use(cookieParser());

// Body parser + file upload
app.use((req, res, next) => {
  if (req.path.startsWith("/api/service")) return next();

  fileupload()(req, res, (err) => {
    if (err) return next(err);

    bodyParser.json({ limit: "30mb" })(req, res, (err) => {
      if (err) return next(err);
      bodyParser.urlencoded({ extended: true, limit: "30mb" })(req, res, next);
    });
  });
});

// Request logging
app.use((req, res, next) => {
  req.correlationId = req.headers["x-correlation-id"] || Date.now().toString();
  logger.info("Incoming request", {
    method: req.method,
    path: req.path,
    correlationId: req.correlationId,
  });
  next();
});

app.use(router);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

// 404 handler
app.use((req, res) => {
  logger.warn("Route not found", {
    method: req.method,
    path: req.path,
    correlationId: req.correlationId,
  });
  res.status(404).json({
    error: "Not Found",
    message: "The requested resource does not exist",
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    correlationId: req.correlationId,
  });

  if (res.headersSent) {
    return next(err);
  }

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS Error", message: err.message });
  }
});

export default app;
