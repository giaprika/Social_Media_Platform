import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../utils/errors.js";
import logger from "../utils/logger.js";
import config from "../config/index.js";
import { getExcludeList } from "./utils.js";
import requestContext from "./context.js";

let excludeList = null;

export const authMiddleware = async (req, res, next) => {
  try {
    if (excludeList === null) {
      excludeList = await getExcludeList();
    }
    const cookieHeader = req.headers.cookie || "";
    const cookies = Object.fromEntries(
      cookieHeader.split("; ").map((cookie) => cookie.split("="))
    );
    const token =
      decodeURIComponent(cookies.accessToken)?.split(" ")[1] ||
      req.headers.authorization?.split(" ")[1];
    const path = req.originalUrl.replace("/api", "");
    if (excludeList.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    if (!token) {
      throw new UnauthorizedError("No token provided");
    }

    const decoded = jwt.verify(token, config.accessTokenSecret);
    req.user = decoded;

    // Thêm correlation ID từ header hoặc tạo mới
    req.correlationId =
      req.headers["x-correlation-id"] || Date.now().toString();
    next();
  } catch (error) {
    logger.error("Authentication error", {
      error: error.message,
      path: req.path,
      correlationId: req.correlationId,
    });

    if (error instanceof UnauthorizedError) {
      return res.status(401).json({
        error: "Unauthorized",
        message: error.message,
      });
    }

    res.status(401).json({
      error: "Unauthorized",
      message: error.message,
    });
  }
};

export const roleMiddleware = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No user found in request",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

export const generateJwtToken = (user, jwtSecret, TTL) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    },
    jwtSecret,
    { expiresIn: TTL }
  );
};

export const contextMiddleware = (req, res, next) => {
  const forwardHeaders = {
    authorization: req.headers.authorization,
    "x-user-id": req.headers["x-user-id"],
    "x-request-id": req.headers["x-request-id"],
    cookie: req.headers.cookie,
    // Thêm các headers khác cần thiết
  };

  // Loại bỏ headers undefined
  const cleanHeaders = Object.fromEntries(
    Object.entries(forwardHeaders).filter(([_, value]) => value !== undefined)
  );

  requestContext.run(
    {
      headers: cleanHeaders,
      user: req.user,
    },
    () => {
      next();
    }
  );
};
