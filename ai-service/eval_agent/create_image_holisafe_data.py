"""
build_eval_from_hf.py

- Load dataset etri-vilab/holisafe-bench from Hugging Face (requires token if private)
- Sample N images per class (image_safety_label: 0 -> no, >0 -> yes)
- Validate + re-encode images using Pillow, convert to base64
- Export JSON evalset compatible with ADK (inlineData)
- Log errors to a file
"""

from __future__ import annotations
import os
import io
import json
import uuid
import base64
import mimetypes
from pathlib import Path
from typing import Tuple, Optional
import pandas as pd
from PIL import Image, UnidentifiedImageError
from datasets import load_dataset
from huggingface_hub import login as hf_login

# ---------------- CONFIG ----------------
HF_DATASET = "etri-vilab/holisafe-bench"
SPLIT = "test"   # change if you want another split (e.g. "test", "validation")
USE_AUTH_TOKEN = True  # will be set depending on get_hf_token()
OUT_FILE = r"D:\Mon_Hoc\Ky_1_25_26\SOA\Social_Media_Platform\ai-service\eval_agent\holisafe_hf_evalset_label_unsafety.evalset.json"
ERROR_LOG = Path(OUT_FILE).with_name("image_encoding_errors.log").as_posix()

EVAL_SET_ID = "holisafe_hf_evalset_label_unsafety"
NAME = "holisafe_hf_evalset_label_unsafety"
DESCRIPTION = "Eval set built from etri-vilab/holisafe-bench with inline base64 images"

# Desired number per class
NUM_PER_CLASS = 150

# Random seed for sampling attempts
RANDOM_STATE = 42

# If not enough valid images, how many extra candidates to try per round
ADDITIONAL_POOL_FACTOR = 2
MAX_ATTEMPTS = 5
# ----------------------------------------

mimetypes.init()

# ---------------- HF login helpers ----------------
def get_hf_token() -> Optional[str]:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if token:
        print("Using Hugging Face token from environment.")
        return token.strip()
    try:
        token = None
    except Exception:
        token = None
    if token == "":
        return None
    return token

def ensure_hf_login(token: Optional[str]) -> Optional[str]:
    if not token:
        print("No Hugging Face token provided; attempting to load public dataset.")
        return None
    try:
        hf_login(token=token)
        print("Logged in to Hugging Face successfully.")
    except Exception as e:
        print("Warning: huggingface_hub.login failed:", e)
    return token

# ---------------- image helpers ----------------
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

def encode_image_pil_to_base64(img: Image.Image, out_format: str) -> Tuple[str, str]:
    buf = io.BytesIO()
    save_kwargs = {}
    if out_format == "JPEG":
        save_kwargs["quality"] = 90
        save_kwargs["optimize"] = True
    img.save(buf, format=out_format, **save_kwargs)
    b = buf.getvalue()
    b64 = base64.b64encode(b).decode("utf-8")
    mime = "image/png" if out_format == "PNG" else "image/jpeg" if out_format == "JPEG" else "image/webp" if out_format == "WEBP" else "application/octet-stream"
    return b64, mime

def encode_image_from_example(example_image) -> Tuple[str, str]:
    """
    Accepts image object from datasets:
    - If example_image is a PIL.Image.Image -> re-encode
    - If example_image is dict with 'path' -> open file from path
    - If example_image is bytes -> base64 encode directly
    - If example_image is a string path -> open file
    Returns (base64_string, mime_type) or raises exception.
    """
    # If datasets.Image, sometimes it's a dict with 'path'
    if example_image is None:
        raise ValueError("Example image is None")

    # PIL Image instance
    if isinstance(example_image, Image.Image):
        # guess format from mode? default to PNG
        out_format = "PNG"
        return encode_image_pil_to_base64(example_image, out_format)

    # dict like {"path": "..."} or {"bytes": ...}
    if isinstance(example_image, dict):
        if "path" in example_image and example_image["path"]:
            path = example_image["path"]
            return encode_image_from_file(path)
        if "bytes" in example_image and example_image["bytes"]:
            b = example_image["bytes"]
            # bytes may be already raw bytes: base64 directly
            try:
                b64 = base64.b64encode(b).decode("utf-8")
                # guess mime from extension unknown -> fallback to png
                return b64, "application/octet-stream"
            except Exception as e:
                raise RuntimeError("Failed to base64 encode raw bytes") from e

    # If it's bytes
    if isinstance(example_image, (bytes, bytearray)):
        b64 = base64.b64encode(example_image).decode("utf-8")
        return b64, "application/octet-stream"

    # If it's a filename string
    if isinstance(example_image, str):
        return encode_image_from_file(example_image)

    # fallback: try to convert using PIL open if possible (some dataset returns numpy arrays)
    try:
        img = Image.fromarray(example_image)  # may fail if not numpy
        return encode_image_pil_to_base64(img, "PNG")
    except Exception:
        raise ValueError("Unsupported image type from dataset. Got type: " + str(type(example_image)))

def encode_image_from_file(path: str) -> Tuple[str, str]:
    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")
    if os.path.getsize(path) == 0:
        raise ValueError(f"File is empty: {path}")

    # Validate + re-encode with Pillow
    try:
        with Image.open(path) as img:
            img.verify()
    except UnidentifiedImageError as e:
        raise ValueError(f"Unidentified/corrupted image: {path}") from e
    except Exception as e:
        raise ValueError(f"Image verify error: {path}: {e}") from e

    # reopen and save normalized
    with Image.open(path) as img:
        mime_from_ext = guess_mime_type_from_filename(path)
        if mime_from_ext == "image/png":
            out_format = "PNG"
        elif mime_from_ext in ("image/jpeg", "image/jpg"):
            out_format = "JPEG"
        elif mime_from_ext == "image/webp":
            out_format = "WEBP"
        else:
            out_format = "PNG"
            mime_from_ext = "image/png"

        if out_format == "JPEG" and img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")

        return encode_image_pil_to_base64(img, out_format)

# ---------------- main sampling/encoding ----------------
def label_to_yesno(label_val) -> str:
    try:
        v = int(label_val)
        return "no" if v == 0 else "yes"
    except Exception:
        # fallback treat '0' string etc
        s = str(label_val).strip().lower()
        return "no" if s in ("0", "no", "none", "clean") else "yes"

def write_error_log(msg: str):
    try:
        with open(ERROR_LOG, "a", encoding="utf-8") as ef:
            ef.write(msg + "\n")
    except Exception:
        print("Failed to write error log:", msg)

def sample_from_dataset(ds, label_col: str, want_n: int, label_kind: str) -> list:
    """
    ds: HuggingFace dataset object (already loaded split)
    label_col: name of label column ('image_safety_label')
    want_n: desired number of successfully encoded items
    label_kind: "no" or "yes"
    """
    selected = []
    # Build index pool for this label
    # We'll collect indices matching label criteria
    indices = []
    for i, ex in enumerate(ds):
        lab = ds[i]
        is_no = False
        try:
            is_no = int(lab[label_col]) == 0
        except Exception:
            is_no = str(lab[label_col]).strip().lower() in ("0", "no", "none", "clean")
        if (label_kind == "no" and is_no) or (label_kind == "yes" and not is_no):
            indices.append(i)

    if not indices:
        print(f"[WARN] No indices found for label {label_kind}")
        return selected

    import random
    random.seed(RANDOM_STATE)

    candidate_count = min(len(indices), max(want_n * 2, want_n))
    tried = set()
    attempt = 0
    while len(selected) < want_n and attempt < MAX_ATTEMPTS:
        attempt += 1
        # sample subset of indices not tried yet
        remaining = [idx for idx in indices if idx not in tried]
        if not remaining:
            break
        sample_n = min(candidate_count, len(remaining))
        sampled = random.sample(remaining, sample_n)
        for idx in sampled:
            tried.add(idx)
            ex = ds[int(idx)]
            # 'image' field name might be 'image' or 'img' or similar; user said column image
            img_field = None
            for cand in ("image", "img", "image_path", "image_bytes"):
                if cand in ex:
                    img_field = cand
                    break
            if img_field is None:
                # try scanning keys for something that looks like image
                for k,v in ex.items():
                    if isinstance(v, (dict, bytes, str)) and ("path" in str(k).lower() or "image" in str(k).lower()):
                        img_field = k
                        break
            if img_field is None:
                write_error_log(f"Index {idx}: no image field found in example keys: {list(ex.keys())}")
                continue

            example_image = ex[img_field]
            try:
                b64, mime = encode_image_from_example(example_image)
            except Exception as e:
                write_error_log(f"Index {idx}: failed encode: {type(e).__name__}: {e}")
                continue

            label_val = ex.get(label_col)
            final_label = label_to_yesno(label_val)
            eval_case = {
                "eval_id": str(uuid.uuid4()),
                "conversation": [
                    {
                        "invocation_id": str(uuid.uuid4()),
                        "user_content": {
                            "parts": [
                                {
                                    "inlineData": {
                                        "displayName": f"{ds[int(idx)]['id']}.img",
                                        "data": b64,
                                        "mimeType": mime
                                    }
                                }
                            ],
                            "role": "user"
                        },
                        "final_response": {
                            "parts": [{"text": final_label}],
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

        # increase candidate_count if not enough
        if len(selected) < want_n:
            candidate_count = min(len(indices), candidate_count * ADDITIONAL_POOL_FACTOR)
            # continue attempts

    return selected

def main():
    token = get_hf_token()
    token = ensure_hf_login(token)
    use_token = token if token else None

    print(f"Loading dataset {HF_DATASET} split={SPLIT} ...")
    ds = load_dataset(HF_DATASET, split=SPLIT)
    ds = ds.shuffle(seed=42).select(range(1500))
    # Filter by specific categories
    ALLOWED_CATEGORIES = ['self_harm', 'sexual_content', "illegal_activity"]
    print(f"Filtering for categories: {ALLOWED_CATEGORIES}")
    
    # Check if 'category' column exists
    if 'category' in ds.column_names:
        ds = ds.filter(lambda x: x['category'] in ALLOWED_CATEGORIES)
        print(f"Filtered dataset size: {len(ds)}")
    else:
        print("WARNING: 'category' column not found in dataset.")
        print("Available columns:", ds.column_names)
    
    ds = ds.shuffle(seed=42).select(range(min(500, len(ds))))
    print("Dataset loaded. Number of examples (split):", len(ds))

    # sanity check columns
    if "image" not in ds.column_names and "image_safety_label" not in ds.column_names:
        # try to inspect columns and warn
        print("WARNING: expected columns 'image' and 'image_safety_label' not both present.")
        print("Columns:", ds.column_names)

    # Build eval cases
    print(f"Selecting up to {NUM_PER_CLASS} per class...")

    selected_no = sample_from_dataset(ds, "image_safety_label", 0, "no")
    print(f"Selected {len(selected_no)} valid 'no' samples.")

    selected_yes = sample_from_dataset(ds, "image_safety_label", NUM_PER_CLASS, "yes")
    print(f"Selected {len(selected_yes)} valid 'yes' samples.")

    eval_cases = selected_no + selected_yes

    # shuffle
    from random import shuffle
    shuffle(eval_cases)

    out = {
        "eval_set_id": EVAL_SET_ID,
        "name": NAME,
        "description": DESCRIPTION,
        "eval_cases": eval_cases
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(eval_cases)} eval_cases to {OUT_FILE}")
    print(f"Error log (if any) at: {ERROR_LOG}")

if __name__ == "__main__":
    main()
