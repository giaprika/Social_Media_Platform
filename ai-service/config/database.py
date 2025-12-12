#connect database

import psycopg2
from psycopg2 import OperationalError
import os
from dotenv import load_dotenv
load_dotenv()
conn = None

def create_connection():
    try:
        conn = psycopg2.connect(
            database= os.getenv("DB_NAME"),         
            user= os.getenv("DB_USER"),              
            password=os.getenv("DB_PASSWORD"),  
            host=os.getenv("DB_HOST"),             
            port=os.getenv("DB_PORT")               
        )
        return conn
    except OperationalError as e:
        print(f"Lỗi kết nối: {e}")
        return None
    
conn = create_connection()
