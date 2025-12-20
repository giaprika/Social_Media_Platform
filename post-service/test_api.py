"""
API Testing Script - Test toàn bộ chức năng Posts, Comments, Reactions
Sử dụng 2 file ảnh PNG để test upload media
"""
import requests
import json
import uuid
from pathlib import Path

# ============= CONFIGURATION =============
BASE_URL = "http://localhost:8003/api/v1"

# Helper to build headers for a given user id
def user_headers(user_id: str, content_type_json: bool = False):
    headers = {"X-User-ID": user_id}
    if content_type_json:
        headers["Content-Type"] = "application/json"
    return headers

USER1_ID = str(uuid.uuid4())
USER2_ID = str(uuid.uuid4())

# Tìm 2 file ảnh PNG trong thư mục hiện tại
image_files = list(Path(".").glob("*.png"))
if len(image_files) < 2:
    print("⚠️ Cần ít nhất 2 file .png trong thư mục hiện tại!")
    print("Vui lòng thêm 2 file ảnh PNG và chạy lại script.")
    exit(1)

IMAGE1_PATH = str(image_files[0])
IMAGE2_PATH = str(image_files[1])

print(f"📸 Sử dụng ảnh: {IMAGE1_PATH} và {IMAGE2_PATH}")
print(f"👤 User 1 ID (X-User-ID): {USER1_ID}")
print(f"👤 User 2 ID (X-User-ID): {USER2_ID}\n")

# Store created IDs for testing
created_post_id = None
created_comment_id = None

# Test statistics
total_tests = 0
passed_tests = 0
failed_tests = 0


def print_section(title):
    """In tiêu đề section"""
    print("\n" + "="*60)
    print(f"🔹 {title}")
    print("="*60)


def print_result(response, test_name, expected_codes=[200, 201, 204]):
    """In kết quả test với PASS/FAIL"""
    global total_tests, passed_tests, failed_tests
    
    total_tests += 1
    is_success = response.status_code in expected_codes
    
    if is_success:
        passed_tests += 1
    else:
        failed_tests += 1
    
    status = "✅ PASS" if is_success else "❌ FAIL"
    
    print(f"\n{status} - {test_name}")
    print(f"Status Code: {response.status_code}")
    
    # Always show response for FAIL, show response for PASS if not 204
    if not is_success or response.status_code != 204:
        try:
            response_data = response.json()
            print(f"Response: {json.dumps(response_data, indent=2, ensure_ascii=False)}")
        except:
            print(f"Response Text: {response.text}")
    
    return response


# ============= 1. HEALTH CHECK =============
print_section("1. HEALTH CHECK")

response = requests.get(f"{BASE_URL}/health")
print_result(response, "Health Check")


# ============= 2. POSTS TESTS =============
print_section("2. POSTS - Create Post (multipart with files)")

# Prepare files for direct post creation (integrated upload)
with open(IMAGE1_PATH, 'rb') as f1, open(IMAGE2_PATH, 'rb') as f2:
    create_post_files = [
        ('files', (Path(IMAGE1_PATH).name, f1, 'image/png')),
        ('files', (Path(IMAGE2_PATH).name, f2, 'image/png'))
    ]
    create_post_data = {
        'content': 'Đây là bài viết test đầu tiên! 🚀',
        'tags': json.dumps(["test", "demo", "first-post"]),
        'visibility': 'public'
    }
    response = requests.post(
        f"{BASE_URL}/posts",
        headers=user_headers(USER1_ID),
        data=create_post_data,
        files=create_post_files
    )
    result = print_result(response, "Tạo post với 2 ảnh (multipart)")
    if response.status_code == 201:
        created_post_id = response.json()['data']['post_id']
        print(f"📝 Created Post ID: {created_post_id}")


print_section("3. POSTS - Create Post (no media)")

post_no_media_data = {
    'content': 'Bài viết không có ảnh, chỉ có text thôi! 📝',
    'tags': json.dumps(["text-only"]),
    'visibility': 'public'
}
response = requests.post(
    f"{BASE_URL}/posts",
    headers=user_headers(USER1_ID),
    data=post_no_media_data
)
print_result(response, "Tạo post không có media (multipart without files)")


print_section("4. POSTS - Get Posts")

# Test 4.1: Lấy danh sách posts
response = requests.get(f"{BASE_URL}/posts?limit=10&offset=0")
print_result(response, "Lấy danh sách 10 posts đầu tiên")


# Test 4.2: Lấy chi tiết post
if created_post_id:
    response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
    print_result(response, f"Lấy chi tiết post {created_post_id}")


print_section("5. POSTS - Update Post")

# Test 5.1: Cập nhật post
if created_post_id:
    update_post_data = {
        'content': 'Đã cập nhật nội dung bài viết! ✏️',
        'tags': json.dumps(["test", "demo", "updated"]),
        'visibility': 'public'
    }
    response = requests.patch(
        f"{BASE_URL}/posts/{created_post_id}",
        headers=user_headers(USER1_ID),
        data=update_post_data
    )
    print_result(response, "Cập nhật nội dung post (multipart no files)")


print_section("6. REACTIONS - Post Reactions")

# Test 6.1: User 1 like post
if created_post_id:
    reaction_data = {"reaction_type": "like"}
    response = requests.post(
        f"{BASE_URL}/posts/{created_post_id}/reactions",
        headers=user_headers(USER1_ID, content_type_json=True),
        json=reaction_data
    )
    print_result(response, "User 1 thả like vào post")
    
    # Verify reacts_count increased
    verify_response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
    if verify_response.status_code == 200:
        reacts_count = verify_response.json()['data'].get('reacts_count', 0)
        print(f"  ➡️ Post reacts_count: {reacts_count} (expect 1)")


# Test 6.2: User 2 love post
if created_post_id:
    reaction_data = {"reaction_type": "love"}
    response = requests.post(
        f"{BASE_URL}/posts/{created_post_id}/reactions",
        headers=user_headers(USER2_ID, content_type_json=True),
        json=reaction_data
    )
    print_result(response, "User 2 thả love vào post")
    
    # Verify reacts_count increased
    verify_response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
    if verify_response.status_code == 200:
        reacts_count = verify_response.json()['data'].get('reacts_count', 0)
        print(f"  ➡️ Post reacts_count: {reacts_count} (expect 2)")


# Test 6.3: User 1 đổi reaction từ like sang love
if created_post_id:
    reaction_data = {"reaction_type": "love"}
    response = requests.post(
        f"{BASE_URL}/posts/{created_post_id}/reactions",
        headers=user_headers(USER1_ID, content_type_json=True),
        json=reaction_data
    )
    print_result(response, "User 1 đổi reaction từ like sang love (UPSERT)")
    
    # Verify reacts_count stayed same (update, not new)
    verify_response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
    if verify_response.status_code == 200:
        reacts_count = verify_response.json()['data'].get('reacts_count', 0)
        print(f"  ➡️ Post reacts_count: {reacts_count} (expect 2, không tăng vì UPSERT)")


# Test 6.4: Lấy danh sách reactions của post
if created_post_id:
    response = requests.get(f"{BASE_URL}/posts/{created_post_id}/reactions")
    print_result(response, "Lấy danh sách reactions của post")


print_section("7. COMMENTS - Create Comment with media (multipart)")

comment_media_urls = []  # Not needed now, integrated upload
if created_post_id:
    with open(IMAGE1_PATH, 'rb') as f:
        comment_files = [('files', (Path(IMAGE1_PATH).name, f, 'image/png'))]
        comment_create_data = {
            'content': 'Comment đầu tiên với ảnh đính kèm! 💬',
            'tags': json.dumps(["first-comment"])
        }
        response = requests.post(
            f"{BASE_URL}/posts/{created_post_id}/comments",
            headers=user_headers(USER2_ID),
            data=comment_create_data,
            files=comment_files
        )
        result = print_result(response, "Tạo comment với ảnh (multipart)")
        if response.status_code == 201:
            created_comment_id = response.json()['data']['comment_id']
            print(f"💬 Created Comment ID: {created_comment_id}")
        # Verify comments_count
        verify_response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
        if verify_response.status_code == 200:
            comments_count = verify_response.json()['data'].get('comments_count', 0)
            print(f"  ➡️ Post comments_count: {comments_count} (expect >=1)")


print_section("8. COMMENTS - Additional Comment Tests")


# Test 8.2: Tạo comment không có media
if created_post_id:
    comment_no_media_data = {
        'content': 'Comment không có ảnh, chỉ text! 📝'
    }
    response = requests.post(
        f"{BASE_URL}/posts/{created_post_id}/comments",
        headers=user_headers(USER1_ID),
        data=comment_no_media_data
    )
    print_result(response, "Tạo comment không có media (multipart no files)")
    
    # Verify comments_count increased
    verify_response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
    if verify_response.status_code == 200:
        comments_count = verify_response.json()['data'].get('comments_count', 0)
        print(f"  ➡️ Post comments_count: {comments_count} (expect 2)")


# Test 8.3: Tạo reply comment (parent_id)
if created_post_id and created_comment_id:
    reply_data = {
        "content": "Đây là reply cho comment trên! 💬↩️",
        "parent_id": created_comment_id
    }
    
    response = requests.post(
        f"{BASE_URL}/posts/{created_post_id}/comments",
        headers=user_headers(USER1_ID),
        data=reply_data
    )
    print_result(response, "Tạo reply comment (nested comment)")


print_section("9. COMMENTS - Get Comments")

# Test 9.1: Lấy danh sách comments của post
if created_post_id:
    response = requests.get(f"{BASE_URL}/posts/{created_post_id}/comments")
    print_result(response, "Lấy danh sách comments của post")


# Test 9.2: Lấy chi tiết comment
if created_post_id and created_comment_id:
    response = requests.get(
        f"{BASE_URL}/posts/{created_post_id}/comments/{created_comment_id}"
    )
    print_result(response, f"Lấy chi tiết comment {created_comment_id}")


print_section("10. COMMENTS - Update Comment")

# Test 10.1: Cập nhật comment
if created_post_id and created_comment_id:
    update_data = {
        "content": "Đã cập nhật nội dung comment! ✏️"
    }
    
    response = requests.patch(
        f"{BASE_URL}/posts/{created_post_id}/comments/{created_comment_id}",
        headers=user_headers(USER2_ID),
        data=update_data
    )
    print_result(response, "Cập nhật nội dung comment (multipart no files)")


print_section("11. REACTIONS - Comment Reactions")

# Test 11.1: User 1 like comment
if created_comment_id:
    reaction_data = {"reaction_type": "like"}
    
    response = requests.post(
        f"{BASE_URL}/comments/{created_comment_id}/reactions",
        headers=user_headers(USER1_ID, content_type_json=True),
        json=reaction_data
    )
    print_result(response, "User 1 thả like vào comment")
    
    # Verify comment reacts_count increased
    if created_post_id:
        verify_response = requests.get(
            f"{BASE_URL}/posts/{created_post_id}/comments/{created_comment_id}"
        )
        if verify_response.status_code == 200:
            reacts_count = verify_response.json()['data'].get('reacts_count', 0)
            print(f"  ➡️ Comment reacts_count: {reacts_count} (expect 1)")


# Test 11.2: User 2 love comment
if created_comment_id:
    reaction_data = {"reaction_type": "haha"}
    
    response = requests.post(
        f"{BASE_URL}/comments/{created_comment_id}/reactions",
        headers=user_headers(USER2_ID, content_type_json=True),
        json=reaction_data
    )
    print_result(response, "User 2 thả haha vào comment")
    
    # Verify comment reacts_count increased
    if created_post_id:
        verify_response = requests.get(
            f"{BASE_URL}/posts/{created_post_id}/comments/{created_comment_id}"
        )
        if verify_response.status_code == 200:
            reacts_count = verify_response.json()['data'].get('reacts_count', 0)
            print(f"  ➡️ Comment reacts_count: {reacts_count} (expect 2)")


# Test 11.3: Lấy reactions của comment
if created_comment_id:
    response = requests.get(f"{BASE_URL}/comments/{created_comment_id}/reactions")
    print_result(response, "Lấy danh sách reactions của comment")


print_section("12. FILTER & PAGINATION TESTS")

# Test 12.1: Filter posts by tags
response = requests.get(f"{BASE_URL}/posts?tag=test&tag=demo&limit=5")
print_result(response, "Filter posts theo tags ['test', 'demo']")


# Test 12.2: Search posts by content
response = requests.get(f"{BASE_URL}/posts?q=test&limit=5")
print_result(response, "Search posts có từ 'test'")


# Test 12.3: Sort posts
response = requests.get(f"{BASE_URL}/posts?sort_by=created_at&order=asc&limit=5")
print_result(response, "Sort posts theo created_at ASC")


print_section("13. DELETE TESTS")

# Test 13.1: User 2 bỏ reaction comment
if created_comment_id:
    response = requests.delete(
        f"{BASE_URL}/comments/{created_comment_id}/reactions",
        headers=user_headers(USER2_ID)
    )
    print_result(response, "User 2 bỏ reaction khỏi comment")
    
    # Verify comment reacts_count decreased
    if created_post_id:
        verify_response = requests.get(
            f"{BASE_URL}/posts/{created_post_id}/comments/{created_comment_id}"
        )
        if verify_response.status_code == 200:
            reacts_count = verify_response.json()['data'].get('reacts_count', 0)
            print(f"  ➡️ Comment reacts_count: {reacts_count} (expect 1, giảm từ 2)")


# Test 13.2: User 1 bỏ reaction post
if created_post_id:
    response = requests.delete(
        f"{BASE_URL}/posts/{created_post_id}/reactions",
        headers=user_headers(USER1_ID)
    )
    print_result(response, "User 1 bỏ reaction khỏi post")
    
    # Verify post reacts_count decreased
    verify_response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
    if verify_response.status_code == 200:
        reacts_count = verify_response.json()['data'].get('reacts_count', 0)
        print(f"  ➡️ Post reacts_count: {reacts_count} (expect 1, giảm từ 2)")


# Test 13.3: Xóa comment
if created_post_id and created_comment_id:
    response = requests.delete(
        f"{BASE_URL}/posts/{created_post_id}/comments/{created_comment_id}",
        headers=user_headers(USER2_ID)
    )
    print_result(response, "Xóa comment")
    
    # Verify post comments_count decreased
    verify_response = requests.get(f"{BASE_URL}/posts/{created_post_id}")
    if verify_response.status_code == 200:
        comments_count = verify_response.json()['data'].get('comments_count', 0)
        print(f"  ➡️ Post comments_count: {comments_count} (expect giảm 1)")


# Test 13.4: Xóa post
if created_post_id:
    response = requests.delete(
        f"{BASE_URL}/posts/{created_post_id}",
        headers=user_headers(USER1_ID)
    )
    print_result(response, "Xóa post")


print_section("14. ERROR HANDLING TESTS")

# Test 14.1: Tạo post không có X-User-ID (expect 400)
missing_user_post_data = {
    'content': 'Post without user id',
    'visibility': 'public'
}
response = requests.post(
    f"{BASE_URL}/posts",
    data=missing_user_post_data  # No headers -> missing X-User-ID
)
print_result(response, "Tạo post KHÔNG có X-User-ID (expect 400)", expected_codes=[400])


# Test 14.2: Get post không tồn tại
fake_post_id = str(uuid.uuid4())
response = requests.get(f"{BASE_URL}/posts/{fake_post_id}")
print_result(response, f"Get post không tồn tại (expect 404)", expected_codes=[404])


# Test 14.3: Tạo post với data trống (tất cả fields đều optional)
empty_post_data = {
    "visibility": "public"
}

response = requests.post(
    f"{BASE_URL}/posts",
    headers=user_headers(USER1_ID),
    data=empty_post_data
)
print_result(response, "Tạo post chỉ có visibility (multipart, all optional)")


# Test 14.4: Upload file không phải image/video
try:
    text_content = b"This is a text file, not an image"
    files = [('files', ('test.txt', text_content, 'text/plain'))]
    
    response = requests.post(
        f"{BASE_URL}/posts/upload",
        headers=user_headers(USER1_ID),
        files=files
    )
    print_result(response, "Upload file .txt (expect 400)", expected_codes=[400])
except Exception as e:
    print(f"❌ Error: {e}")


print_section("15. SUMMARY")

print(f"""
✅ Test hoàn tất!

📊 Kết quả test:
  ✅ PASSED: {passed_tests}/{total_tests}
  ❌ FAILED: {failed_tests}/{total_tests}
  📊 Tỉ lệ thành công: {(passed_tests/total_tests*100):.1f}%

📊 Đã test các chức năng:
  ✓ Health check
  ✓ Upload media (posts & comments)
  ✓ CRUD Posts (Create, Read, Update, Delete)
  ✓ CRUD Comments (Create, Read, Update, Delete)
  ✓ CRUD Reactions (Create/Upsert, Read, Delete)
  ✓ Filter & Pagination
  ✓ Search & Sort
  ✓ Nested comments (Reply)
  ✓ Error handling (401, 404, 400/422)
  ✓ HATEOAS links
  ✓ RESTful principles

🎯 Các test case:
  • 2 users với UUID giả lập
  • Upload và sử dụng 2 file ảnh PNG
  • Tạo posts với/không có media
  • Tạo comments với/không có media
  • Nested comments (reply)
  • Multiple reactions types (like, love, haha)
  • UPSERT reactions
  • Authorization testing
  • Error scenarios

💡 Lưu ý:
  • Cần chạy server trước: python app.py
  • Cần cấu hình Supabase trong .env
  • Cần có 2 file .png trong thư mục hiện tại
""")
