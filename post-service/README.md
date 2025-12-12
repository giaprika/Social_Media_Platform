## 1) Python backend setup
Create a `.env` in project root (use your real values):

SUPABASE_URL=
SUPABASE_KEY=
POSTS_TABLE_NAME=posts
COMMENTS_TABLE_NAME=comments
POST_REACT_TABLE_NAME=post_reaction
COMMENT_REACT_TABLE_NAME=comment_reaction
STORAGE_BUCKET_NAME=posts_service
# Server Configuration
PORT=8000

Install and run:

```powershell
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

or
\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
