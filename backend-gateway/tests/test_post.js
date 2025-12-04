import postService from "../src/services/posts/postService.js"; // thêm .js (điều chỉnh nếu file khác)
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { File } from "fetch-blob/file.js";

const test_user_id = uuidv4();
const filePath = "D:\\ADMIN\\3-que-la-gi-1-1675678242.jpg";
const buffer = await fs.readFile(path.resolve(filePath));

// Tạo một đối tượng file đơn giản, giống như multer
const mockFile = {
    originalname: "3-que-la-gi-1-1675678242.jpg",
    mimetype: "image/jpeg",
    buffer: buffer,
    size: buffer.length
};

const mockFile2 = {
    originalname: "3-que-la-gi-1-1675678242.jpg",
    mimetype: "image/jpeg",
    buffer: buffer,
    size: buffer.length
};

postService.moderateContentWithAI("hello", [mockFile, mockFile2], test_user_id).then(result => {
    console.log("Moderation Result:", result);
}).catch(error => {
    console.error("Error during moderation:", error);
});