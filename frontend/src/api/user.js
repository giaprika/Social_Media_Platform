import instance from "src/api/axios";

const USER_SERVICE_BASE_URL =
  process.env.USER_SERVICE_BASE_URL || "http://localhost:8001";

export const getMe = () => instance.get(`${USER_SERVICE_BASE_URL}/users/me`);

export const getUserStats = (userId) => 
  instance.get(`${USER_SERVICE_BASE_URL}/users/${userId}/stats`);

export const updateUser = (userId, updateData) =>
  instance.patch(`${USER_SERVICE_BASE_URL}/users/${userId}`, updateData);

export const updatePassword = (userId, currentPassword, newPassword) =>
  instance.patch(`${USER_SERVICE_BASE_URL}/users/${userId}/password`, {
    currentPassword,
    newPassword,
  });

export const getUserSettings = (userId) =>
  instance.get(`${USER_SERVICE_BASE_URL}/users/${userId}/settings`);

export const updateUserSettings = (userId, settings) =>
  instance.patch(`${USER_SERVICE_BASE_URL}/users/${userId}/settings`, settings);