import instance from "./axios";
import axios from "axios";

const API_BASE_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

const instanceWithoutCredential = axios.create({ baseURL: API_BASE_URL });

const signup = (credential) => {
  return instanceWithoutCredential.post("/api/users/registering", credential);
};

const login = (credential) =>
  instanceWithoutCredential.post("/api/users/logining", credential);

const refreshToken = () => instance.get("/api/users/refresh-token");

// GOOGLE LOGIN / SIGNUP API
const loginWithGoogle = (body) => {
  return instanceWithoutCredential.post("/api/users/gg-logining", body);
};

const signupWithGoogle = (body) =>
  instanceWithoutCredential.post("/api/users/gg-registering", body);

export { signup, login, refreshToken, loginWithGoogle, signupWithGoogle };
