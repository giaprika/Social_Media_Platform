import psycopg2
from psycopg2 import OperationalError
import os
from dotenv import load_dotenv
from tools.tools import create_violation_record, query_user_validations_count, warning_user, ban_user, report_user_violation
import base64
import uuid
load_dotenv()

USER_ID = "8d0358ed-d5b1-46f7-a795-115ed42a46bd"

def create_connection():
    conn = None
    try:
        # Thay thế các thông số bên dưới bằng thông tin của bạn
        conn = psycopg2.connect(
            database= os.getenv("DB_NAME"),         # Tên database bạn muốn kết nối
            user= os.getenv("DB_USER"),              # User mặc định thường là 'postgres'
            password=os.getenv("DB_PASSWORD"),  # Mật khẩu bạn đã đặt khi cài PostgreSQL
            host=os.getenv("DB_HOST"),             # Chạy local thì để localhost hoặc 127.0.0.1
            port=os.getenv("DB_POST")                # Port mặc định là 5432
        )
        
        print("Kết nối thành công đến PostgreSQL!")
        
        # Tạo con trỏ (cursor) để thực thi lệnh SQL
        cur = conn.cursor()
        
        # Thử chạy một lệnh đơn giản: Lấy version của PostgreSQL
        cur.execute("SELECT version();")
        
        # Lấy kết quả trả về
        db_version = cur.fetchone()
        print(f"Phiên bản PostgreSQL: {db_version}")
        
        # Đóng con trỏ
        cur.close()
        
    except OperationalError as e:
        print(f"Lỗi kết nối: {e}")
    finally:
        # Luôn đóng kết nối cuối cùng để giải phóng tài nguyên
        if conn:
            conn.close()
            print("Đã đóng kết nối database.")

def test_create_violation_record():
    user_id = USER_ID
    violation_type = "image"
    description = "Inappropriate content"
    text_content = "This is a test text content."
    image_path = r"D:\ADMIN\test_model.jpg"

    # 2. Đọc file ảnh và mã hóa sang Base64
    with open(image_path, "rb") as image_file:
    # Đọc binary -> Encode Base64 -> Decode sang string UTF-8 để bỏ dấu b''
        image_content = base64.b64encode(image_file.read()).decode('utf-8')
    
    result = create_violation_record(user_id, violation_type, description, text_content, image_content)
    print("Create Violation Record Result:", result)

def test_report_user_violation():
    user_id = USER_ID
    violation_type = "image"
    description = "Inappropriate content"
    text_content = "This is a test text content."
    image_path = r"D:\ADMIN\test_model.jpg"

    # 2. Đọc file ảnh và mã hóa sang Base64
    with open(image_path, "rb") as image_file:
    # Đọc binary -> Encode Base64 -> Decode sang string UTF-8 để bỏ dấu b''
        image_content = base64.b64encode(image_file.read()).decode('utf-8')
    
    result = report_user_violation(user_id, violation_type, description, text_content, image_content)
    print("Report User Violation Result:", result)

if __name__ == "__main__":
    create_connection()
    # test_create_violation_record()
    test_report_user_violation()