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
    
    Returns: ADK agent response, which may contain:
    - events array with agent outputs
    - Last event should contain the moderation result JSON
 */
export default async function moderateContent(payload) {
  // payload is expected to be the object the AI service accepts
  try {
    const userId = payload.userId || "anonymous_user";
    const { data: sessionData, session_id } = await createSession(userId);
    console.log("[aiService] Session created:", session_id);
    payload.appName = APP_NAME;
    payload.sessionId = session_id;

    const res = await client.post(`/run`, payload);
    console.log("[aiService] ADK response:", JSON.stringify(res.data, null, 2));
    
    // Parse ADK response
    // ADK trả về array of events, event cuối cùng chứa kết quả từ agent
    if (res.data && Array.isArray(res.data)) {
      // Tìm event cuối cùng có content
      const lastEvent = res.data[res.data.length - 1];
      if (lastEvent && lastEvent.content && lastEvent.content.parts) {
        try {
          // Agent trả về JSON trong markdown code block
          // Format: ```json\n{...}\n```
          let textContent = lastEvent.content.parts[0].text;
          
          // Extract JSON from markdown code block
          const jsonMatch = textContent.match(/```json\s*\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            textContent = jsonMatch[1];
          }
          
          const moderationResult = JSON.parse(textContent);
          console.log("[aiService] Parsed moderation result:", moderationResult);
          return moderationResult; // { result: "Accepted|Warning|Banned", message: "..." }
        } catch (parseError) {
          console.error("[aiService] Failed to parse agent response:", parseError);
          return { ok: false, error: "Failed to parse AI response" };
        }
      }
    }
    
    // Fallback: return raw data
    return res.data;
  } catch (err) {
    console.error("[aiService] Error:", err.message);
    const message = err?.response?.data || err.message || "Unknown error";
    return { ok: false, error: message, status: err?.response?.status };
  }
}
