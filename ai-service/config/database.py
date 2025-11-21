#connect database

import psycopg2
from psycopg2 import OperationalError
import os
from dotenv import load_dotenv
load_dotenv()
conn = None
def create_connection():
    global conn
    try:
        # Thay thế các thông số bên dưới bằng thông tin của bạn
        return psycopg2.connect(
            database= os.getenv("DB_NAME"),         # Tên database bạn muốn kết nối
            user= os.getenv("DB_USER"),              # User mặc định thường là 'postgres'
            password=os.getenv("DB_PASSWORD"),  # Mật khẩu bạn đã đặt khi cài PostgreSQL
            host=os.getenv("DB_HOST"),             # Chạy local thì để localhost hoặc
            port=os.getenv("DB_PORT")                # Port mặc định là 5432
        )

    except OperationalError as e:
        print(f"Lỗi kết nối: {e}")
        return None
    
conn = create_connection()
