import os
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # Prefer service key on server
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET_NAME", "posts")

if not SUPABASE_URL or not SUPABASE_KEY:
	raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Supabase Upload API (Python)")

app.add_middleware(
	CORSMiddleware,
	allow_origins=[
		"http://localhost:5173",
		"http://127.0.0.1:5173",
	],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


def sanitize_filename(name: str) -> str:
	return "".join(ch if ch.isalnum() or ch in [".", "_", "-"] else "_" for ch in name)


def public_url_for(path: str) -> str:
	# Build the known pattern for public buckets to avoid SDK differences
	return f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"


def ensure_bucket_exists() -> None:
	try:
		info = supabase.storage.get_bucket(STORAGE_BUCKET)
		# If bucket not found, info may be None or raise; try create
		if not info:
			supabase.storage.create_bucket(
				STORAGE_BUCKET,
				{
					"public": True,
					"fileSizeLimit": 20 * 1024 * 1024,
					"allowedMimeTypes": ["image/png", "image/jpeg", "image/webp", "image/gif"],
				},
			)
	except Exception:
		# Try to create anyway (idempotent enough for dev)
		try:
			supabase.storage.create_bucket(
				STORAGE_BUCKET,
				{
					"public": True,
					"fileSizeLimit": 20 * 1024 * 1024,
					"allowedMimeTypes": ["image/png", "image/jpeg", "image/webp", "image/gif"],
				},
			)
		except Exception:
			# ignore if already exists or no permission
			pass


ensure_bucket_exists()


@app.get("/health")
def health():
	return {"ok": True, "bucket": STORAGE_BUCKET}


def upload_files(files: List[UploadFile], user_id: Optional[str]) -> List[str]:
	urls: List[str] = []
	for f in files:
		if not f.content_type or not f.content_type.startswith("image/"):
			raise HTTPException(status_code=400, detail=f"Unsupported file type: {f.content_type}")
		prefix = f"{user_id}/" if user_id else "anonymous/"
		path = f"{prefix}{int(__import__('time').time() * 1000)}-{sanitize_filename(f.filename or 'image')}"
		data = f.file.read()
		# Reset file pointer for good measure (FastAPI may handle close automatically)
		try:
			supabase.storage.from_(STORAGE_BUCKET).upload(path, data)
		except Exception as e:
			raise HTTPException(status_code=500, detail=f"Upload failed for {f.filename}: {e}")
		urls.append(public_url_for(path))
	return urls


@app.post("/upload")
async def upload(
	images: List[UploadFile] = File(...),
	user_id: Optional[str] = Form(None),
	content: Optional[str] = Form(None),  # not used in this endpoint, kept for parity
):
	urls = upload_files(images, user_id)
	return {"urls": urls}


@app.post("/upload-and-create-post")
async def upload_and_create_post(
	images: List[UploadFile] = File(...),
	user_id: Optional[str] = Form(None),
	content: Optional[str] = Form(None),
	visibility: Optional[str] = Form(None),
	shared_type: Optional[str] = Form(None),
	post_type: Optional[str] = Form(None),
):
	urls = upload_files(images, user_id)

	payload = {"media_urls": urls}
	if user_id:
		payload["user_id"] = user_id
	if content:
		payload["content"] = content
	if visibility:
		payload["visibility"] = visibility
	if shared_type:
		payload["shared_type"] = shared_type
	if post_type:
		payload["post_type"] = post_type

	try:
		resp = supabase.table("posts").insert(payload).execute()
		# supabase-py returns dict with data attribute
		data = resp.data if hasattr(resp, "data") else resp
		return {"post": data[0] if isinstance(data, list) and data else data, "urls": urls}
	except Exception as e:
		# Return URLs even if DB insertion fails so you can still verify Storage
		raise HTTPException(status_code=400, detail=f"DB insert failed: {e}")

