import postService from "../src/services/posts/postService.js"; 
import { moderateContentLivestream } from "../src/services/livestream/index.js";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { File } from "fetch-blob/file.js";

const test_user_id = uuidv4();
const filePath = "D:\\ADMIN\\Test_model.mp4";
const base64_string = await fs.readFile(path.resolve(filePath));



const res = await moderateContentLivestream(test_user_id, [base64_string.toString('base64')]);
console.log("Moderation Result:", res);
