import axios from "axios";
import { request, response } from "express";
import { v4 as uuidv4 } from "uuid"; 

const AI_BASE = process.env.AI_SERVICE_URL || "http://localhost:9000";
const APP_NAME = process.env.APP_NAME || "content_moderation_agent";

const client = axios.create({
  baseURL: AI_BASE,
  timeout: parseInt(process.env.AI_SERVICE_TIMEOUT || "20000", 10),
  headers: {
    "Content-Type": "application/json",
  },
});

async function createSession(userId) {
    let res = null;
    let session_id = null;
    try {
    const session_payload = {"state": {}}
    session_id = uuidv4();
    res = await client.post(`/apps/${APP_NAME}/users/${userId}/sessions/${session_id}`, session_payload);
    } catch (err) {
      const message = err?.response?.data || err.message || "Unknown error";
      return { ok: false, error: message, status: err?.response?.status };
    }
    return { ok: true, data: res.data, session_id: session_id };
}


/**
    payload = {
    "userId": user_id,
    "newMessage": new_message
    }
 */
//export default async function moderateContent(payload) {
export default async function moderateContent(userId, content, List<File>) {
  // payload is expected to be the object the AI service accepts
  try {
    const userId = payload.userId || "anonymous_user";
    const { data: sessionData, session_id } = await createSession(userId);
    console.log(sessionData);
    payload.appName = APP_NAME;
    payload.sessionId = session_id;

    const res = await client.post(`/run`, payload);
    //return res.data;
    return true; // Or false if toxic
  } catch (err) {
    const message = err?.response?.data || err.message || "Unknown error";
    return { ok: false, error: message, status: err?.response?.status };
  }
}
