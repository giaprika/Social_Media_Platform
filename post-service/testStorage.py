import os
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client

# Load .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET_NAME", "posts_service")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Upload Test Service")

# Cho phép frontend truy cập API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        content_type = file.content_type
        if not (content_type.startswith("image/") or content_type.startswith("video/")):
            raise HTTPException(status_code=400, detail="Chỉ chấp nhận ảnh hoặc video")

        ext = os.path.splitext(file.filename)[1]
        random_name = f"{uuid.uuid4()}{ext}"
        storage_path = f"{random_name}"

        file_bytes = await file.read()
        res = supabase.storage.from_(STORAGE_BUCKET).upload(storage_path, file_bytes)
        if hasattr(res, "error") and res.error:
            raise HTTPException(status_code=500, detail=str(res.error))

        public_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)
        return {"filename": file.filename, "stored_as": storage_path, "url": public_url}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi upload: {str(e)}")
