import instance from "src/api/axios";

const USER_SERVICE_BASE_URL =
  process.env.USER_SERVICE_BASE_URL || "http://localhost:8001";

export const getMe = () => instance.get(`${USER_SERVICE_BASE_URL}/users/me`);
