import { v4 as uuidv4 } from "uuid";
import {
  hashPassword,
  comparePassword,
  recordToken,
} from "../utils/authUtils.js";
import { UserRepository } from "../repositories/user.repository.js";

export class UserService {
  static async createUser(userData) {
    const {
      email,
      password,
      full_name,
      avatar_url = null,
      birth_date,
      gender,
      metadata = {},
    } = userData;

    const existingUser = await UserRepository.findUserByEmail(email);
    if (existingUser) {
      throw new Error("Đã có người sử dụng email này.");
    }

    const hashedPassword = await hashPassword(password);
    const userId = uuidv4();

    const newUser = {
      id: userId,
      email,
      hashed_password: hashedPassword,
      full_name,
      avatar_url,
      birth_date,
      gender,
      created_at: new Date(),
      metadata,
    };

    console.log("🆕 Creating new user:", newUser);

    const createdUser = await UserRepository.insertUser(newUser);
    return createdUser;
  }

  static async deleteUser(userId) {
    const existingUser = await UserRepository.findUserById(userId);
    if (!existingUser) {
      throw new Error("Người dùng không tồn tại.");
    }
    return await UserRepository.deleteUserById(existingUser.id);
  }

  static async findUserByEmail(email) {
    return await UserRepository.findUserByEmail(email);
  }

  static async findUserById(id) {
    return await UserRepository.findUserById(id);
  }

  static async loginUser(email, password) {
    const user = await UserRepository.findUserByEmailWithPassword(email);
    if (!user) {
      throw new Error("Email hoặc mật khẩu không đúng.");
    }

    const isMatch = await comparePassword(password, user.hashed_password);
    if (!isMatch) {
      throw new Error("Email hoặc mật khẩu không đúng.");
    }

    const { hashed_password, ...userInfo } = user;
    return userInfo;
  }

  static async saveRefreshToken(userId, refreshToken, expiresAt) {
    await recordToken(userId, refreshToken, expiresAt);
  }
}
