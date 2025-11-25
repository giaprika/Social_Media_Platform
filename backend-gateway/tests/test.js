import moderateContent from "../src/services/ai/aiService.js";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const image_url = "D:\\ADMIN\\3-que-la-gi-1-1675678242.jpg";
let base64_string = "";
// Function to fetch image and convert to base64
async function fileToBase64(filePath) {
  const abs = path.resolve(filePath);
  const data = await fs.readFile(abs);
  return data.toString("base64");
}

base64_string = await fileToBase64(image_url);

const newMessage = {
    "role": "user",
    "parts":[
         {
            "text":"fuckyou?"
         },
        //  {
        //     "inlineData":{
        //        "displayName":"test_model.jpg",
        //        "data":base64_string,
        //        "mimeType":"image/png"
        //     }
        //  }
      ]
}

const test_user_id = uuidv4();
async function testModerateContent() {
    const payload = {
        "userId": test_user_id,
        "newMessage": newMessage
    };
    try {
    const result = await moderateContent(payload);
    console.log("Moderation Result:", result[result.length - 1].content);
} catch (error) {
    console.error("Error during moderation:", error);
}
}

testModerateContent();