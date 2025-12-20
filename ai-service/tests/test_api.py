import requests
import base64
import os
import time
from pathlib import Path

# Try ADK server first (9000). If not available, fallback to local moderation_api (9001)
BASE_URL = "http://localhost:9002"
APP_NAME = "content_moderation_agent" # Phải khớp tên trong file agent.py
USER_ID = "8d0358ed-d5b1-46f7-a795-115ed42a46bd"


user_id = "9b72d69d-32a4-44c7-b2f9-3f4a3b6e89f1"

image_path = r"D:\ADMIN\Test_model.mp4"

# 2. Đọc file ảnh và mã hóa sang Base64
with open(image_path, "rb") as image_file:
    # Đọc binary -> Encode Base64 -> Decode sang string UTF-8 để bỏ dấu b''
    base64_string = base64.b64encode(image_file.read()).decode('utf-8')

new_message = {
    "role": "user",
    "parts":[
         {
            "text":"check this image"
         },
         {
            "inlineData":{
               "displayName":"Test_model.mp4",
               "data":base64_string,
               "mimeType":"video/mp4"
            }
         }
      ]
}

session_id = f"s_{int(time.time())}"  # Unique session ID
user_id = "u_123"

payload = {
    "appName": "content_moderation_agent",
    "userId": user_id,
    "sessionId": session_id,
    "newMessage": new_message
}
headers = {
    "Content-Type": "application/json"
}

# Khởi tạo session (phiên)
session_payload = {"state": {}}

print(f"Creating session: {session_id}")
r = requests.post(
    f"{BASE_URL}/apps/{APP_NAME}/users/{user_id}/sessions/{session_id}",
    json=session_payload,
)
r.raise_for_status()
print("Session initialized with ID:", r.json()["id"])

response = requests.post(f"{BASE_URL}/run", json=payload, headers=headers)
print(response.status_code)
if response.status_code == 200:
    print(response.json())
else:
    print(f"Error {response.status_code}:")
    print(response.text)
