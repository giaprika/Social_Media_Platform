"""
create_combined_image_text_data.py

Tạo eval set kết hợp cả ảnh và text. Chỉ khi CẢ HAI đều an toàn thì mới coi là an toàn.
- Load dataset text từ sonlam1102/vihsd
- Load dataset ảnh từ etri-vilab/holisafe-bench
- Kết hợp chúng để tạo ra các trường hợp:
  1. Text safe + Image safe -> SAFE
  2. Text safe + Image unsafe -> UNSAFE
  3. Text unsafe + Image safe -> UNSAFE
  4. Text unsafe + Image unsafe -> UNSAFE
"""

from __future__ import annotations
import os
import io
import json
import uuid
import base64
import mimetypes
from pathlib import Path
from typing import Tuple, Optional, List, Dict
from PIL import Image, UnidentifiedImageError
from datasets import load_dataset
from huggingface_hub import login as hf_login

# ---------------- CONFIG ----------------
HF_IMAGE_DATASET = "etri-vilab/holisafe-bench"
HF_TEXT_DATASET = "sonlam1102/vihsd"
IMAGE_SPLIT = "test"
TEXT_SPLIT = "train"

OUT_FILE = r"D:\Mon_Hoc\Ky_1_25_26\SOA\Social_Media_Platform\ai-service\eval_agent\combined_image_text_evalset.evalset.json"
ERROR_LOG = Path(OUT_FILE).with_name("combined_encoding_errors.log").as_posix()

EVAL_SET_ID = "combined_image_text_evalset"
NAME = "Combined Image and Text Evaluation Set"
DESCRIPTION = "Eval set combining images and text. Only safe when BOTH image and text are safe."

# Số lượng mẫu cho mỗi loại kết hợp
NUM_SAFE_SAFE = 50        # Text safe + Image safe -> SAFE
NUM_SAFE_UNSAFE = 50      # Text safe + Image unsafe -> UNSAFE
NUM_UNSAFE_SAFE = 50      # Text unsafe + Image safe -> UNSAFE
NUM_UNSAFE_UNSAFE = 50    # Text unsafe + Image unsafe -> UNSAFE

RANDOM_STATE = 42
# ----------------------------------------

mimetypes.init()

# ---------------- HF login helpers ----------------
def get_hf_token() -> Optional[str]:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if token:
        print("Using Hugging Face token from environment.")
        return token.strip()
    return None

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

# ---------------- Image encoding helpers ----------------
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
    Encode image from dataset example
    Returns (base64_string, mime_type) or raises exception.
    """
    if example_image is None:
        raise ValueError("Example image is None")

    # PIL Image instance
    if isinstance(example_image, Image.Image):
        out_format = "PNG"
        return encode_image_pil_to_base64(example_image, out_format)

    # dict like {"path": "..."} or {"bytes": ...}
    if isinstance(example_image, dict):
        if "path" in example_image and example_image["path"]:
            path = example_image["path"]
            return encode_image_from_file(path)
        if "bytes" in example_image and example_image["bytes"]:
            b = example_image["bytes"]
            try:
                b64 = base64.b64encode(b).decode("utf-8")
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

    # fallback: try to convert using PIL
    try:
        img = Image.fromarray(example_image)
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

        if out_format == "JPEG" and img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")

        return encode_image_pil_to_base64(img, out_format)

# ---------------- Text helpers ----------------
def find_text_field(example: Dict) -> str:
    for candidate in ("text", "content", "sentence", "comment", "utterance", "tweet"):
        if candidate in example and example[candidate] is not None:
            return str(example[candidate])
    for k, v in example.items():
        if isinstance(v, str):
            return v
    return ""

# ---------------- Label helpers ----------------
def image_label_to_safe(label_val) -> bool:
    """Convert image safety label to boolean. 0 = safe, >0 = unsafe"""
    try:
        v = int(label_val)
        return v == 0
    except Exception:
        s = str(label_val).strip().lower()
        return s in ("0", "no", "none", "clean", "safe")

def text_label_to_safe(label_val) -> bool:
    """Convert text label to boolean. 0 = safe, >0 = unsafe"""
    try:
        v = int(label_val)
        return v == 0
    except Exception:
        s = str(label_val).strip().lower()
        return s in ("0", "no", "none", "clean", "safe")

def write_error_log(msg: str):
    try:
        with open(ERROR_LOG, "a", encoding="utf-8") as ef:
            ef.write(msg + "\n")
    except Exception:
        print("Failed to write error log:", msg)

# ---------------- Main sampling and combination ----------------
def load_and_prepare_images(ds_images, num_safe: int, num_unsafe: int) -> Tuple[List[Dict], List[Dict]]:
    """
    Load images and separate them into safe and unsafe lists
    Returns (safe_images, unsafe_images)
    """
    print("Processing images...")
    safe_images = []
    unsafe_images = []
    
    for idx, example in enumerate(ds_images):
        try:
            # Get image safety label
            label = example.get("image_safety_label", 0)
            is_safe = image_label_to_safe(label)
            
            # Encode image
            image_data = example.get("image")
            if image_data is None:
                continue
                
            b64_str, mime_type = encode_image_from_example(image_data)
            
            image_entry = {
                "base64": b64_str,
                "mime_type": mime_type,
                "original_label": label,
                "is_safe": is_safe
            }
            
            if is_safe and len(safe_images) < num_safe:
                safe_images.append(image_entry)
            elif not is_safe and len(unsafe_images) < num_unsafe:
                unsafe_images.append(image_entry)
                
            # Stop when we have enough
            if len(safe_images) >= num_safe and len(unsafe_images) >= num_unsafe:
                break
                
        except Exception as e:
            error_msg = f"Image idx={idx}: {str(e)}"
            print(f"  ⚠ {error_msg}")
            write_error_log(error_msg)
            continue
    
    print(f"  ✓ Collected {len(safe_images)} safe images, {len(unsafe_images)} unsafe images")
    return safe_images, unsafe_images

def load_and_prepare_texts(ds_texts, num_safe: int, num_unsafe: int) -> Tuple[List[Dict], List[Dict]]:
    """
    Load texts and separate them into safe and unsafe lists
    Returns (safe_texts, unsafe_texts)
    """
    print("Processing texts...")
    safe_texts = []
    unsafe_texts = []
    
    for idx, example in enumerate(ds_texts):
        try:
            # Get text
            text = find_text_field(example)
            if not text or len(text.strip()) == 0:
                continue
            
            # Get label
            label = None
            for key in ("label", "label_id"):
                if key in example:
                    label = example[key]
                    break
            
            if label is None:
                continue
                
            is_safe = text_label_to_safe(label)
            
            text_entry = {
                "text": text,
                "original_label": label,
                "is_safe": is_safe
            }
            
            if is_safe and len(safe_texts) < num_safe:
                safe_texts.append(text_entry)
            elif not is_safe and len(unsafe_texts) < num_unsafe:
                unsafe_texts.append(text_entry)
                
            # Stop when we have enough
            if len(safe_texts) >= num_safe and len(unsafe_texts) >= num_unsafe:
                break
                
        except Exception as e:
            error_msg = f"Text idx={idx}: {str(e)}"
            print(f"  ⚠ {error_msg}")
            write_error_log(error_msg)
            continue
    
    print(f"  ✓ Collected {len(safe_texts)} safe texts, {len(unsafe_texts)} unsafe texts")
    return safe_texts, unsafe_texts

def create_eval_case(text_entry: Dict, image_entry: Dict, is_combined_safe: bool) -> Dict:
    """Create a single eval case combining text and image"""
    eval_id = str(uuid.uuid4())
    invocation_id = str(uuid.uuid4())
    
    # Final answer: "no" if safe (no violation), "yes" if unsafe (has violation)
    final_answer = "no" if is_combined_safe else "yes"
    
    eval_case = {
        "eval_id": eval_id,
        "conversation": [
            {
                "invocation_id": invocation_id,
                "user_content": {
                    "parts": [
                        {"text": text_entry["text"]},
                        {
                            "inline_data": {
                                "mime_type": image_entry["mime_type"],
                                "data": image_entry["base64"]
                            }
                        }
                    ],
                    "role": "user"
                },
                "final_response": {
                    "parts": [{"text": final_answer}],
                    "role": "model"
                },
                "intermediate_data": {
                    "tool_uses": [],
                    "intermediate_responses": []
                },
            },
        ],
        "session_input": {
            "app_name": "eval_agent",
            "user_id": "user",
            "state": {}
        },
        "metadata": {
            "text_is_safe": text_entry["is_safe"],
            "image_is_safe": image_entry["is_safe"],
            "combined_is_safe": is_combined_safe,
            "text_label": text_entry["original_label"],
            "image_label": image_entry["original_label"]
        }
    }
    
    return eval_case

def main():
    print("=" * 60)
    print("Creating Combined Image + Text Evaluation Set")
    print("=" * 60)
    
    # Login to HF
    token = get_hf_token()
    ensure_hf_login(token)
    
    # Calculate total needs
    total_safe_images_needed = NUM_SAFE_SAFE + NUM_UNSAFE_SAFE
    total_unsafe_images_needed = NUM_SAFE_UNSAFE + NUM_UNSAFE_UNSAFE
    total_safe_texts_needed = NUM_SAFE_SAFE + NUM_SAFE_UNSAFE
    total_unsafe_texts_needed = NUM_UNSAFE_SAFE + NUM_UNSAFE_UNSAFE
    
    # Load datasets
    print(f"\nLoading image dataset: {HF_IMAGE_DATASET} (split={IMAGE_SPLIT})...")
    ds_images = load_dataset(HF_IMAGE_DATASET, split=IMAGE_SPLIT)
    
    print(f"Loading text dataset: {HF_TEXT_DATASET} (split={TEXT_SPLIT})...")
    ds_texts = load_dataset(HF_TEXT_DATASET, split=TEXT_SPLIT)
    
    # Shuffle datasets
    ds_images = ds_images.shuffle(seed=RANDOM_STATE)
    ds_texts = ds_texts.shuffle(seed=RANDOM_STATE)
    
    # Prepare images and texts
    print("\n" + "=" * 60)
    safe_images, unsafe_images = load_and_prepare_images(
        ds_images, 
        total_safe_images_needed, 
        total_unsafe_images_needed
    )
    
    safe_texts, unsafe_texts = load_and_prepare_texts(
        ds_texts,
        total_safe_texts_needed,
        total_unsafe_texts_needed
    )
    
    # Check if we have enough data
    print("\n" + "=" * 60)
    print("Data availability check:")
    print(f"  Safe images: {len(safe_images)}/{total_safe_images_needed}")
    print(f"  Unsafe images: {len(unsafe_images)}/{total_unsafe_images_needed}")
    print(f"  Safe texts: {len(safe_texts)}/{total_safe_texts_needed}")
    print(f"  Unsafe texts: {len(unsafe_texts)}/{total_unsafe_texts_needed}")
    
    if len(safe_images) < total_safe_images_needed:
        print(f"  ⚠ Warning: Not enough safe images!")
    if len(unsafe_images) < total_unsafe_images_needed:
        print(f"  ⚠ Warning: Not enough unsafe images!")
    if len(safe_texts) < total_safe_texts_needed:
        print(f"  ⚠ Warning: Not enough safe texts!")
    if len(unsafe_texts) < total_unsafe_texts_needed:
        print(f"  ⚠ Warning: Not enough unsafe texts!")
    
    # Create eval cases
    print("\n" + "=" * 60)
    print("Creating eval cases...")
    eval_cases = []
    
    # 1. Safe text + Safe image -> SAFE
    print(f"\n1. Creating {NUM_SAFE_SAFE} cases: Safe Text + Safe Image = SAFE")
    for i in range(min(NUM_SAFE_SAFE, len(safe_texts), len(safe_images))):
        eval_case = create_eval_case(safe_texts[i], safe_images[i], is_combined_safe=True)
        eval_cases.append(eval_case)
    print(f"  ✓ Created {min(NUM_SAFE_SAFE, len(safe_texts), len(safe_images))} cases")
    
    # 2. Safe text + Unsafe image -> UNSAFE
    print(f"\n2. Creating {NUM_SAFE_UNSAFE} cases: Safe Text + Unsafe Image = UNSAFE")
    safe_text_idx = NUM_SAFE_SAFE  # Continue from where we left off
    for i in range(min(NUM_SAFE_UNSAFE, len(safe_texts) - safe_text_idx, len(unsafe_images))):
        eval_case = create_eval_case(safe_texts[safe_text_idx + i], unsafe_images[i], is_combined_safe=False)
        eval_cases.append(eval_case)
    print(f"  ✓ Created {min(NUM_SAFE_UNSAFE, len(safe_texts) - safe_text_idx, len(unsafe_images))} cases")
    
    # 3. Unsafe text + Safe image -> UNSAFE
    print(f"\n3. Creating {NUM_UNSAFE_SAFE} cases: Unsafe Text + Safe Image = UNSAFE")
    safe_image_idx = NUM_SAFE_SAFE  # Continue from where we left off
    for i in range(min(NUM_UNSAFE_SAFE, len(unsafe_texts), len(safe_images) - safe_image_idx)):
        eval_case = create_eval_case(unsafe_texts[i], safe_images[safe_image_idx + i], is_combined_safe=False)
        eval_cases.append(eval_case)
    print(f"  ✓ Created {min(NUM_UNSAFE_SAFE, len(unsafe_texts), len(safe_images) - safe_image_idx)} cases")
    
    # 4. Unsafe text + Unsafe image -> UNSAFE
    print(f"\n4. Creating {NUM_UNSAFE_UNSAFE} cases: Unsafe Text + Unsafe Image = UNSAFE")
    unsafe_text_idx = NUM_UNSAFE_SAFE
    unsafe_image_idx = NUM_SAFE_UNSAFE
    for i in range(min(NUM_UNSAFE_UNSAFE, len(unsafe_texts) - unsafe_text_idx, len(unsafe_images) - unsafe_image_idx)):
        eval_case = create_eval_case(unsafe_texts[unsafe_text_idx + i], unsafe_images[unsafe_image_idx + i], is_combined_safe=False)
        eval_cases.append(eval_case)
    print(f"  ✓ Created {min(NUM_UNSAFE_UNSAFE, len(unsafe_texts) - unsafe_text_idx, len(unsafe_images) - unsafe_image_idx)} cases")
    
    # Create output JSON
    print("\n" + "=" * 60)
    output = {
        "eval_set_id": EVAL_SET_ID,
        "name": NAME,
        "description": DESCRIPTION,
        "eval_cases": eval_cases
    }
    
    # Write to file
    print(f"Writing {len(eval_cases)} eval cases to {OUT_FILE}...")
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Successfully wrote {len(eval_cases)} eval cases")
    
    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY:")
    print(f"  Total eval cases: {len(eval_cases)}")
    safe_count = sum(1 for ec in eval_cases if ec["metadata"]["combined_is_safe"])
    unsafe_count = len(eval_cases) - safe_count
    print(f"  Safe cases: {safe_count}")
    print(f"  Unsafe cases: {unsafe_count}")
    print(f"  Output file: {OUT_FILE}")
    if os.path.exists(ERROR_LOG):
        print(f"  Error log: {ERROR_LOG}")
    print("=" * 60)

if __name__ == "__main__":
    main()
