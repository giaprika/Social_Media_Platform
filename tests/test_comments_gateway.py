"""
Test toàn bộ chức năng COMMENTS qua Backend Gateway
- Test AI moderation cho comments
- Tất cả requests đi qua Gateway: http://localhost:3000/api/posts
"""
import requests
import json
import uuid

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

print(f"👤 Using logged-in user: {user_id}\n")

# Store created IDs
created_post_id = None
created_comment_id = None
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
# SETUP: CREATE A POST FIRST
# ============================================================
print_section("SETUP - Create a test post")

try:
    response = requests.post(
        GATEWAY_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id,
            "Content-Type": "application/json"
        },
        json={
            "content": "Test post for comments via Gateway! 🚀",
            "visibility": "public",
            "tags": ["test", "comments"]
        }
    )
    print_result(response, "Tạo post để test comments")
    
    if response.status_code == 201:
        created_post_id = response.json()["data"]["post_id"]
        print(f"   📝 Created Post ID: {created_post_id}\n")
    else:
        print("❌ Không thể tạo post. Dừng test.")
        exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)


# ============================================================
# 1. TEST CREATE COMMENT (AI Moderation)
# ============================================================
print_section("1. CREATE COMMENT (AI Moderation)")

try:
    response = requests.post(
        f"{GATEWAY_URL}/{created_post_id}/comments",
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id,
            "Content-Type": "application/json"
        },
        json={
            "content": "Great post! Thanks for sharing via Gateway! 👍"
        }
    )
    print_result(response, "Tạo comment qua Gateway")
    
    if response.status_code == 201:
        created_comment_id = response.json()["data"]["comment_id"]
        print(f"   💬 Created Comment ID: {created_comment_id}\n")
except Exception as e:
    print(f"❌ Error: {e}\n")


# ============================================================
# 2. TEST CREATE COMMENT - INAPPROPRIATE (Should reject)
# ============================================================
print_section("2. CREATE COMMENT - Inappropriate Content")

try:
    response = requests.post(
        f"{GATEWAY_URL}/{created_post_id}/comments",
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id,
            "Content-Type": "application/json"
        },
        json={
            "content": "You are an idiot! This post is trash!"
        }
    )
    print_result(response, "Comment với nội dung không phù hợp (expect 400)", expected_codes=[400])
except Exception as e:
    print(f"❌ Error: {e}\n")


# ============================================================
# 3. TEST CREATE NESTED COMMENT (Reply)
# ============================================================
if created_comment_id:
    print_section("3. CREATE NESTED COMMENT (Reply)")
    
    try:
        response = requests.post(
            f"{GATEWAY_URL}/{created_post_id}/comments",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id,
                "Content-Type": "application/json"
            },
            json={
                "content": "Thanks for your comment! 😊",
                "parent_comment_id": created_comment_id
            }
        )
        print_result(response, "Tạo reply comment")
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 4. TEST GET COMMENTS
# ============================================================
print_section("4. GET COMMENTS")

try:
    response = requests.get(
        f"{GATEWAY_URL}/{created_post_id}/comments",
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-User-ID": user_id
        },
        params={"limit": 10}
    )
    print_result(response, "Lấy danh sách comments")
except Exception as e:
    print(f"❌ Error: {e}\n")


# ============================================================
# 5. TEST UPDATE COMMENT (AI Moderation)
# ============================================================
if created_comment_id:
    print_section("5. UPDATE COMMENT (AI Moderation)")
    
    try:
        response = requests.patch(
            f"{GATEWAY_URL}/comments/{created_comment_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id,
                "Content-Type": "application/json"
            },
            json={
                "content": "Updated comment via Gateway! ✨"
            }
        )
        print_result(response, "Cập nhật comment qua Gateway")
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 6. TEST UPDATE COMMENT - INAPPROPRIATE (Should reject)
# ============================================================
if created_comment_id:
    print_section("6. UPDATE COMMENT - Inappropriate Content")
    
    try:
        response = requests.patch(
            f"{GATEWAY_URL}/comments/{created_comment_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id,
                "Content-Type": "application/json"
            },
            json={
                "content": "Fuck you all!"
            }
        )
        print_result(response, "Update comment với nội dung không phù hợp (expect 400)", expected_codes=[400])
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 7. TEST COMMENT REACTIONS
# ============================================================
if created_comment_id:
    print_section("7. TEST COMMENT REACTIONS")
    
    # Add reaction
    try:
        response = requests.post(
            f"{GATEWAY_URL}/comments/{created_comment_id}/reactions",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id,
                "Content-Type": "application/json"
            },
            json={"reaction_type": "like"}
        )
        print_result(response, "Thêm reaction LIKE cho comment")
    except Exception as e:
        print(f"❌ Error: {e}\n")
    
    # Get reactions
    try:
        response = requests.get(
            f"{GATEWAY_URL}/comments/{created_comment_id}/reactions",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            }
        )
        print_result(response, "Lấy danh sách reactions của comment")
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# 8. TEST DELETE COMMENT
# ============================================================
if created_comment_id:
    print_section("8. DELETE COMMENT")
    
    try:
        response = requests.delete(
            f"{GATEWAY_URL}/comments/{created_comment_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            }
        )
        print_result(response, "Xóa comment", expected_codes=[204, 200])
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# CLEANUP: DELETE TEST POST
# ============================================================
if created_post_id:
    print_section("CLEANUP - Delete test post")
    
    try:
        response = requests.delete(
            f"{GATEWAY_URL}/{created_post_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-User-ID": user_id
            }
        )
        print_result(response, "Xóa test post", expected_codes=[204, 200])
    except Exception as e:
        print(f"❌ Error: {e}\n")


# ============================================================
# SUMMARY
# ============================================================
print_section("SUMMARY")

print(f"""
✅ Test hoàn tất!

📊 Kết quả test COMMENTS qua Gateway:
  ✅ PASSED: {passed_tests}/{total_tests}
  ❌ FAILED: {failed_tests}/{total_tests}
  📈 Success Rate: {(passed_tests/total_tests*100):.1f}%

🔍 Lưu ý:
  - Tất cả requests đi qua Gateway (port 3000)
  - AI Moderation được trigger tự động cho comments
  - Check logs để xem chi tiết AI decision
  - Nested comments (replies) được support
""")
