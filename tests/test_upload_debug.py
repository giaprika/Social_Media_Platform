"""
Debug file upload to Gateway
"""
import requests
import os
from pathlib import Path

GATEWAY_BASE_URL = "http://localhost:3000"
GATEWAY_URL = f"{GATEWAY_BASE_URL}/api/posts"

# Login credentials
EMAIL = "nguyenbinh39205@gmail.com"
PASSWORD = "Binh392005"

# Login first
print("🔐 Logging in...")
login_response = requests.post(
    f"{GATEWAY_BASE_URL}/api/users/login",
    json={"email": EMAIL, "password": PASSWORD}
)

if login_response.status_code != 200:
    print(f"❌ Login failed: {login_response.text}")
    exit(1)

login_data = login_response.json()
access_token = login_data["access_token"]
user_id = login_data["user"]["id"]
print(f"✅ Logged in as user: {user_id}")

# Find an image
image_files = list(Path(".").glob("*.png")) + list(Path(".").glob("*.jpg"))
if not image_files:
    print("⚠️ No image files found, creating a test image...")
    # Create a simple 1x1 PNG
    import base64
    # Minimal valid PNG (1x1 red pixel)
    png_data = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    )
    with open("test_image.png", "wb") as f:
        f.write(png_data)
    IMAGE_PATH = "test_image.png"
else:
    IMAGE_PATH = str(image_files[0])

print(f"📸 Using image: {IMAGE_PATH}")
print(f"   File size: {os.path.getsize(IMAGE_PATH)} bytes")

# Test 1: Upload with just 1 image
print("\n" + "="*50)
print("TEST 1: Upload with 1 image")
print("="*50)

with open(IMAGE_PATH, 'rb') as f:
    files = [('files', (os.path.basename(IMAGE_PATH), f, 'image/png'))]
    data = {'content': 'Test upload 1 image'}
    
    response = requests.post(
        GATEWAY_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id
        },
        files=files,
        data=data
    )
    
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")

# Test 2: Upload without files (text only, form data)
print("\n" + "="*50)
print("TEST 2: Text only (form data)")
print("="*50)

response = requests.post(
    GATEWAY_URL,
    headers={
        "Authorization": f"Bearer {access_token}",
        "X-User-ID": user_id
    },
    data={'content': 'Test text only via form data'}
)

print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")
