export const authenticate = (req, res, next) => {
  try {
    // Kiểm tra header X-User-Id được truyền từ Gateway sau khi đã xác thực
    const userId = req.headers["x-user-id"];
    console.log("Authenticating request, x-user-id:", userId);

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Thiếu thông tin xác thực từ gateway" });
    }

    // Gán thông tin user vào request
    req.user = { id: userId };
    next();
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Lỗi xử lý thông tin xác thực", error: error.message });
  }
};
