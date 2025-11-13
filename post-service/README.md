# Supabase Upload Demo (React + Python)

This project provides a Python FastAPI backend and a React UI to upload images to a Supabase Storage bucket and optionally insert a row into the `posts` table containing the `media_urls` array.

## Prerequisites

- Node.js 18+
- A Supabase project with:
  - Service role key
  - A Storage bucket (the server will auto-create if missing)
  - A `posts` table with a `media_urls` column (type: `text[]`)

## 1) Python backend setup

Create a `.env` in project root (use your real values):

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_KEY=YOUR_SERVICE_ROLE_KEY
STORAGE_BUCKET_NAME=posts
```

Install and run:

```powershell
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Health check:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/health | ConvertTo-Json -Depth 5
```

Expected:

```
{
  "ok": true,
  "bucket": "posts"
}
```

## 2) Client (React) setup

```powershell
# in a new terminal, from project root
cd client
# ensure API base points to Python backend
echo VITE_API_BASE_URL=http://localhost:8000 > .env
npm install
npm run dev
```

Open http://localhost:5173 and use the form to:

- Enter a user ID (optional)
- Enter content (optional)
- Select one or more images
- Click "Upload only" (just uploads to Storage) or "Upload + Create Post" (also inserts row with `media_urls`)

## Notes

- The backend uses the Supabase service role key. Keep it only on the server, never ship it to the browser.
- The backend can auto-create the bucket if missing and set it to public (dev convenience).
- If the `posts` table has required fields other than `media_urls`, either provide them in the request body or add default values in your schema.
- If you see storage errors, ensure the bucket exists and the key/URL are correct.

## API endpoints (FastAPI)

- `POST /upload` — multipart/form-data: `images`[] (files), `user_id` (optional), `content` (optional). Returns `{ urls: string[] }`.
- `POST /upload-and-create-post` — same form fields; returns `{ post, urls }` or error if insert fails.
