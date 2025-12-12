"""
build_eval_image_evalset.py

- Đọc CSV chứa đường dẫn ảnh và nhãn (cột imagePath, decision)
- Lọc ảnh theo prefix
- Lấy N ảnh cho mỗi lớp (no / yes) (sau khi lọc và loại bỏ ảnh lỗi)
- Chuyển ảnh sang base64 an toàn (dùng Pillow để validate & re-encode nếu cần)
- Xuất file JSON dạng eval_set tương thích với ADK (inlineData)
- Ghi log các ảnh lỗi vào file log
"""

from __future__ import annotations
import os
import io
import json
import uuid
import base64
import mimetypes
from pathlib import Path
from typing import Tuple
import pandas as pd
from PIL import Image, UnidentifiedImageError

# ---------------- CONFIG ----------------
CSV_FILE = r"D:\Mon_Hoc\Ky_1_25_26\SOA\harmful_image_10000_ann.csv"
IMG_DIR = r"D:\Mon_Hoc\Ky_1_25_26\SOA\harmful_images_10000\all_10000_evenHarmfulUnharmful"
OUT_FILE = r"D:\Mon_Hoc\Ky_1_25_26\SOA\Social_Media_Platform\ai-service\eval_agent\image_testing_moderation_agent_label_not_harmful.evalset.json"
ERROR_LOG = Path(OUT_FILE).with_name("image_encoding_errors.log").as_posix()

EVAL_SET_ID = "image_testing_moderation_agent_label_not_harmful"
NAME = "image_testing_moderation_agent_label_not_harmful"
DESCRIPTION = "Filtered evalset from harmful images (inline base64 images)"

# Prefix filter (bắt đầu bằng)
PREFIXES = (
    # "animal_genitalia",
    # "blood",
    "fetish",
    "nudity",
    "noose",
    "terrorist"
    # "violence",
)

# Số mẫu mong muốn cho mỗi lớp (no / yes)
NUM_PER_CLASS = 150

# Seed cho sampling (pandas.sample)
RANDOM_STATE = 42

# Nếu dataset không đủ sau khi loại ảnh lỗi, max attempts bổ sung (tăng candidate pool)
ADDITIONAL_POOL_FACTOR = 2  # nếu cần, sẽ lấy thêm factor * NUM_PER_CLASS candidates ban đầu
# ----------------------------------------

mimetypes.init()

def guess_mime_type_from_filename(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    if mime:
        return mime
    ext = Path(filename).suffix.lower()
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    return "application/octet-stream"

def encode_image_to_base64_safe(image_path: str) -> Tuple[str, str]:
    """
    Validate and (re-)encode image using Pillow, return (base64_string, mime_type).
    Raises exception on errors.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"File not found: {image_path}")
    if os.path.getsize(image_path) == 0:
        raise ValueError(f"File is empty: {image_path}")

    display_name = os.path.basename(image_path)
    mime_type = guess_mime_type_from_filename(display_name)

    # Verify image integrity
    try:
        with Image.open(image_path) as img:
            img.verify()
    except UnidentifiedImageError as e:
        raise ValueError(f"Unidentified/corrupted image: {image_path}") from e
    except Exception as e:
        raise ValueError(f"Image verify error: {image_path}: {e}") from e

    # Re-open and re-encode to normalize headers (Pillow requires reopen after verify)
    try:
        with Image.open(image_path) as img:
            # decide output format
            if mime_type == "image/png":
                out_format = "PNG"
            elif mime_type in ("image/jpeg", "image/jpg"):
                out_format = "JPEG"
            elif mime_type == "image/webp":
                out_format = "WEBP"
            else:
                # fallback to PNG
                out_format = "PNG"
                mime_type = "image/png"

            # Convert mode if necessary (JPEG doesn't support alpha)
            if out_format == "JPEG" and img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")

            buf = io.BytesIO()
            save_kwargs = {}
            if out_format == "JPEG":
                save_kwargs["quality"] = 90
                save_kwargs["optimize"] = True

            img.save(buf, format=out_format, **save_kwargs)
            b = buf.getvalue()
            b64 = base64.b64encode(b).decode("utf-8")
            return b64, mime_type
    except Exception as e:
        # Final fallback: raw binary read -> base64 (may still be accepted)
        try:
            with open(image_path, "rb") as f:
                b = f.read()
            b64 = base64.b64encode(b).decode("utf-8")
            return b64, mime_type
        except Exception as e2:
            raise RuntimeError(f"Failed to re-encode or read image: {image_path}: {e}; fallback failed: {e2}") from e2

def write_error_log(msg: str):
    try:
        with open(ERROR_LOG, "a", encoding="utf-8") as ef:
            ef.write(msg + "\n")
    except Exception:
        print("Failed to write error log:", msg)

def filter_by_prefix(df: pd.DataFrame) -> pd.DataFrame:
    # safe: ensure imagePath is str
    df = df[df["imagePath"].notna()].copy()
    df["imagePath"] = df["imagePath"].astype(str)
    mask = df["imagePath"].str.startswith(PREFIXES)
    return df[mask].reset_index(drop=True)

def sample_and_encode(df_candidates: pd.DataFrame, want_n: int, label_filter: str) -> list:
    """
    df_candidates: filtered dataframe (by prefix)
    want_n: number of successful encoded samples to return
    label_filter: "no" or "yes" (string check)
    """
    selected = []
    # select rows for this label
    if label_filter == "no":
        pool = df_candidates[df_candidates["decision"].str.lower() == "no"].copy()
    else:
        pool = df_candidates[df_candidates["decision"].str.lower() != "no"].copy()

    if pool.empty:
        print(f"[WARN] No candidates for label {label_filter}")
        return selected

    # initial candidate count to sample (may increase if many fail)
    candidate_count = min(len(pool), max(want_n * 2, want_n))
    tried_indices = set()
    attempt = 0
    while len(selected) < want_n and attempt < 5:
        attempt += 1
        # sample candidates not tried yet
        remaining_pool = pool.drop(index=list(tried_indices)) if tried_indices else pool
        if remaining_pool.empty:
            break
        # sample up to candidate_count from remaining_pool
        sample_n = min(candidate_count, len(remaining_pool))
        sampled = remaining_pool.sample(n=sample_n, random_state=RANDOM_STATE + attempt)
        for _, row in sampled.iterrows():
            idx = row.name
            tried_indices.add(idx)
            image_rel = str(row["imagePath"])
            image_path = os.path.join(IMG_DIR, image_rel)
            if not os.path.exists(image_path):
                write_error_log(f"MISSING: {image_path}")
                continue
            try:
                b64, mime = encode_image_to_base64_safe(image_path)
            except Exception as e:
                write_error_log(f"{image_rel}: {type(e).__name__}: {e}")
                continue

            # build eval_case item (single invocation conversation)
            eval_case = {
                "eval_id": str(uuid.uuid4()),
                "conversation": [
                    {
                        "invocation_id": str(uuid.uuid4()),
                        "user_content": {
                            "parts": [
                                {
                                    "inlineData": {
                                        "displayName": image_rel,
                                        "data": b64,
                                        "mimeType": mime
                                    }
                                }
                            ],
                            "role": "user"
                        },
                        "final_response": {
                            "parts": [{"text": "no" if label_filter == "no" else "yes"}],
                            "role": "model"
                        },
                        "intermediate_data": {
                            "tool_uses": [],
                            "intermediate_responses": []
                        }
                    }
                ],
                "session_input": {
                    "app_name": "eval_agent",
                    "user_id": "test_user",
                    "state": {}
                }
            }
            selected.append(eval_case)
            if len(selected) >= want_n:
                break

        # if insufficient, increase candidate_count and try again
        if len(selected) < want_n:
            candidate_count = min(len(pool), candidate_count * ADDITIONAL_POOL_FACTOR)
            if len(tried_indices) >= len(pool):
                # tried everything, break
                break

    return selected

def main():
    print("Loading CSV:", CSV_FILE)
    df = pd.read_csv(CSV_FILE)
    # Ensure required columns exist
    if "imagePath" not in df.columns or "decision" not in df.columns:
        raise RuntimeError("CSV must contain 'imagePath' and 'decision' columns")

    # Filter by prefix
    df_filtered = filter_by_prefix(df)
    print(f"After prefix filter: {len(df_filtered)} rows")

    # Build eval cases
    eval_cases = []

    # sample no
    print(f"Selecting up to {NUM_PER_CLASS} 'no' samples...")
    selected_no = sample_and_encode(df_filtered, 150, "no")
    print(f"Selected {len(selected_no)} valid 'no' samples (encoded).")

    # sample yes
    print(f"Selecting up to {NUM_PER_CLASS} 'yes' samples...")
    selected_yes = sample_and_encode(df_filtered, 0, "yes")
    print(f"Selected {len(selected_yes)} valid 'yes' samples (encoded).")

    eval_cases.extend(selected_no)
    eval_cases.extend(selected_yes)

    # Shuffle eval_cases to mix labels
    from random import shuffle
    shuffle(eval_cases)

    out = {
        "eval_set_id": EVAL_SET_ID,
        "name": NAME,
        "description": DESCRIPTION,
        "eval_cases": eval_cases
    }

    # Write output JSON
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(eval_cases)} eval_cases to {OUT_FILE}")
    print(f"Error log (if any) at: {ERROR_LOG}")

if __name__ == "__main__":
    main()
