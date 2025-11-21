/**
 * Authentication Middleware
 * Checks for x-user-id header from Gateway
 */
export const authenticate = (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Attach user info to request
    req.user = { id: userId };
    next();
  } catch (error) {
    return res.status(500).json({ 
      error: "Lỗi xử lý thông tin xác thực", 
      message: error.message 
    });
  }
};

/**
 * Optional authentication middleware
 * Doesn't fail if no user-id, but attaches if present
 */
export const optionalAuthenticate = (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];
    if (userId) {
      req.user = { id: userId };
    }
    next();
  } catch (error) {
    return res.status(500).json({ 
      error: "Lỗi xử lý thông tin xác thực", 
      message: error.message 
    });
  }
};

