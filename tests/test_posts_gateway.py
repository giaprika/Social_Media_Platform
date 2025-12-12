"""
Test toàn bộ chức năng POSTS qua Backend Gateway
- Test AI moderation cho posts
- Test reactions
- Tất cả requests đi qua Gateway: http://localhost:3000/api/posts
"""
import requests
import json
import uuid
import os
from pathlib import Path

# ============= CONFIGURATION =============
GATEWAY_BASE_URL = "http://localhost:3000"
GATEWAY_URL = f"{GATEWAY_BASE_URL}/api/posts"

# Login credentials
LOGIN_EMAIL = "nguyenbinh39205@gmail.com"
LOGIN_PASSWORD = "Binh392005"

# Will be set after login
access_token = None
user_id = None

def login():
    """Login và lấy access token"""
    global access_token, user_id
    print("\n🔐 Đang đăng nhập...")
    try:
        response = requests.post(
            f"{GATEWAY_BASE_URL}/api/users/login",
            json={
                "email": LOGIN_EMAIL,
                "password": LOGIN_PASSWORD
            }
        )
        if response.status_code == 200:
            data = response.json()
            access_token = data["access_token"]
            user_id = data["user"]["id"]
            print(f"✅ Đăng nhập thành công!")
            print(f"👤 User ID: {user_id}")
            print(f"🔑 Access Token: {access_token[:50]}...\n")
            return True
        else:
            print(f"❌ Đăng nhập thất bại: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Lỗi khi đăng nhập: {e}")
        return False

# Login trước khi test
if not login():
    print("\n❌ Không thể đăng nhập. Dừng test.")
    exit(1)

# Tìm 2 file ảnh trong folder tests
image_files = list(Path(".").glob("*.png")) + list(Path(".").glob("*.jpg"))
if len(image_files) < 2:
    print("⚠️ Cần ít nhất 2 file ảnh (.png hoặc .jpg) trong folder tests!")
    exit(1)

IMAGE1_PATH = str(image_files[0])
IMAGE2_PATH = str(image_files[1])

print(f"📸 Sử dụng ảnh: {IMAGE1_PATH} và {IMAGE2_PATH}\n")

# Store created IDs
created_post_id = None
total_tests = 0
passed_tests = 0
failed_tests = 0


def print_section(title):
    """In tiêu đề section"""
    print("\n" + "=" * 60)
    print(f"🔹 {title}")
    print("=" * 60)


def print_result(response, test_name, expected_codes=[200, 201]):
    """In kết quả test"""
    global total_tests, passed_tests, failed_tests
    total_tests += 1
    
    status_code = response.status_code
    is_success = status_code in expected_codes
    
    if is_success:
        print(f"✅ PASS - {test_name}")
        print(f"   Status Code: {status_code}")
        passed_tests += 1
    else:
        print(f"❌ FAIL - {test_name}")
        print(f"   Status Code: {status_code}")
        print(f"   Response: {response.text[:500]}")
        failed_tests += 1
    
    # In response data nếu có
    try:
        data = response.json()
        if "data" in data:
            print(f"   Data: {json.dumps(data['data'], indent=2, ensure_ascii=False)[:200]}")
        if "moderation" in data:
            print(f"   🤖 AI Moderation: {data['moderation']}")
        if "reason" in data:
            print(f"   ⚠️ Reason: {data['reason']}")
    except:
        pass
    print()


# ============================================================
# 1. TEST CREATE POST - TEXT ONLY
# ============================================================
print_section("1. CREATE POST - Text Only (AI Moderation)")

try:
    # Sử dụng form data thay vì JSON vì Gateway sử dụng multer
    response = requests.post(
        GATEWAY_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id
        },
        data={
            "content": "This is a test post from gateway! 🚀",
            "visibility": "public",
            "tags": "test,gateway"  # tags dưới dạng string, separated by comma
        }
    )
    print_result(response, "Tạo post text qua Gateway")
    
    if response.status_code == 201:
        created_post_id = response.json()["data"]["post_id"]
        print(f"   📝 Created Post ID: {created_post_id}\n")
except Exception as e:
    print(f"❌ Error: {e}\n")


# ============================================================
# 2. TEST CREATE POST - WITH IMAGES (AI Moderation)
# ============================================================
print_section("2. CREATE POST - With Images (AI Moderation)")

try:
    # Lấy tên file thuần túy
    img1_name = os.path.basename(IMAGE1_PATH)
    img2_name = os.path.basename(IMAGE2_PATH)
    
    # Xác định mime type dựa vào extension
    img1_mime = 'image/png' if img1_name.endswith('.png') else 'image/jpeg'
    img2_mime = 'image/png' if img2_name.endswith('.png') else 'image/jpeg'
    
    # Mở file và gửi trực tiếp trong context manager
    with open(IMAGE1_PATH, 'rb') as f1, open(IMAGE2_PATH, 'rb') as f2:
        files = [
            ('files', (img1_name, f1, img1_mime)),
            ('files', (img2_name, f2, img2_mime))
        ]
        data = {
            'content': 'Post with 2 images via Gateway! 📸',
            'visibility': 'public',
            'tags': 'test,images'
        }
        
        response = requests.post(
            GATEWAY_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            },
            files=files,
            data=data
        )
    
    print_result(response, "Tạo post với 2 ảnh qua Gateway")
    
    if response.status_code == 201:
        img_post_id = response.json()["data"]["post_id"]
        print(f"   📝 Created Image Post ID: {img_post_id}\n")
except Exception as e:
    print(f"❌ Error: {e}\n")


# ============================================================
# 3. TEST CREATE POST - INAPPROPRIATE CONTENT (Should be rejected)
# ============================================================
print_section("3. CREATE POST - Inappropriate Content (Should Reject)")

try:
    # Sử dụng form data thay vì JSON vì Gateway sử dụng multer
    response = requests.post(
        GATEWAY_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id
        },
        data={
            "content": "I hate everyone! This platform sucks! Kill them all!",
            "visibility": "public"
        }
    )
    print_result(response, "Post với nội dung không phù hợp (expect 400)", expected_codes=[400])
except Exception as e:
    print(f"❌ Error: {e}\n")


# ============================================================
# 4. TEST GET POSTS
# ============================================================
print_section("4. GET POSTS")

try:
    response = requests.get(
        GATEWAY_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id
        },
        params={"limit": 10}
    )
    print_result(response, "Lấy danh sách posts")
except Exception as e:
    print(f"❌ Error: {e}\n")


# ============================================================
# 5. TEST GET POST BY ID
# ============================================================
if created_post_id:
    print_section("5. GET POST BY ID")
    
    try:
        response = requests.get(
            f"{GATEWAY_URL}/{created_post_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            }
        )
        print_result(response, "Lấy chi tiết post")
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 6. TEST UPDATE POST (AI Moderation)
# ============================================================
if created_post_id:
    print_section("6. UPDATE POST (AI Moderation)")
    
    try:
        response = requests.patch(
            f"{GATEWAY_URL}/{created_post_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            },
            data={
                "content": "Updated content via Gateway! ✨",
                "tags": "updated,gateway"
            }
        )
        print_result(response, "Cập nhật post qua Gateway")
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 7. TEST UPDATE POST - INAPPROPRIATE (Should reject)
# ============================================================
if created_post_id:
    print_section("7. UPDATE POST - Inappropriate Content")
    
    try:
        response = requests.patch(
            f"{GATEWAY_URL}/{created_post_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            },
            data={
                "content": "Fuck this shit! I will kill you!"
            }
        )
        print_result(response, "Update với nội dung không phù hợp (expect 400)", expected_codes=[400])
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 8. TEST REACTIONS
# ============================================================
if created_post_id:
    print_section("8. TEST REACTIONS")
    
    # Add reaction
    try:
        response = requests.post(
            f"{GATEWAY_URL}/{created_post_id}/reactions",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id,
                "Content-Type": "application/json"
            },
            json={"reaction_type": "love"}
        )
        print_result(response, "Thêm reaction LOVE")
    except Exception as e:
        print(f"❌ Error: {e}\n")
    
    # Get reactions
    try:
        response = requests.get(
            f"{GATEWAY_URL}/{created_post_id}/reactions",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            }
        )
        print_result(response, "Lấy danh sách reactions")
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 9. TEST DELETE POST
# ============================================================
if created_post_id:
    print_section("9. DELETE POST")
    
    try:
        response = requests.delete(
            f"{GATEWAY_URL}/{created_post_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            }
        )
        print_result(response, "Xóa post", expected_codes=[204, 200])
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# SUMMARY
# ============================================================
print_section("SUMMARY")

print(f"""
✅ Test hoàn tất!

📊 Kết quả test POSTS qua Gateway:
  ✅ PASSED: {passed_tests}/{total_tests}
  ❌ FAILED: {failed_tests}/{total_tests}
  📈 Success Rate: {(passed_tests/total_tests*100):.1f}%

🔍 Lưu ý:
  - Tất cả requests đi qua Gateway (port 3000)
  - AI Moderation được trigger tự động
  - Check logs để xem chi tiết AI decision
""")
