"""
build_eval_json_with_login.py

Tương tự script trước, nhưng thêm phần đăng nhập Hugging Face.
"""

import os
import json
import uuid
from datasets import load_dataset
from huggingface_hub import login as hf_login
import datasets

# --- Cấu hình đầu ra ---
OUT_FILE = "D:\\Mon_Hoc\\Ky_1_25_26\\SOA\\Social_Media_Platform\\ai-service\\eval_agent\\eval_set_for_testing_moderation_agent.evalset.json"
EVAL_SET_ID = "eval_set_for_testing_moderation_agent"
NAME = "eval_set_for_testing_moderation_agent"
DESCRIPTION = "This is an eval set that is used for unit testing behavior of the Agent"

# --- Hugging Face login helper ---
def get_hf_token():

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if token:
        print("Using Hugging Face token from environment.")
        return token.strip()

    try:
        # hỏi input (ẩn không cần thiết nhưng tiện)
        token = input("Nhập Hugging Face token (hoặc Enter để không dùng token): ").strip()
    except Exception:
        token = None

    if token == "":
        return None
    return token

def ensure_hf_login(token):

    if not token:
        print("No Hugging Face token provided — dataset sẽ được tải công khai nếu dataset public.")
        return None

    # login (lưu token cục bộ)
    try:
        hf_login(token=token)
        print("Logged in to Hugging Face successfully.")
    except Exception as e:
        print("Không thể login với token đã cung cấp:", e)
        # vẫn trả về token để thử dùng trực tiếp khi tải dataset
    return token

# --- Helper functions cho conversion ---
def label_to_yesno(label):
    if isinstance(label, int):
        return "no" if label == 0 else "yes"
    if isinstance(label, str):
        s = label.strip().lower()
        if s in ("clean", "0", "none", "neutral"):
            return "no"
        return "yes"
    return "yes"

def find_text_field(example):
    for candidate in ("text", "content", "sentence", "comment", "utterance", "tweet"):
        if candidate in example and example[candidate] is not None:
            return example[candidate]
    for k,v in example.items():
        if isinstance(v, str):
            return v
    return ""

# --- Main flow ---
def main():
    token = get_hf_token()
    token = ensure_hf_login(token)

    # Load dataset split test
    print("Loading dataset sonlam1102/vihsd (split=train)...")
    ds = load_dataset("sonlam1102/vihsd", split="train")
    # Tách dataset thành 2 phần:
    ds_label0 = ds.filter(lambda x: x["label_id"] == 0)
    ds_label1 = ds.filter(lambda x: x["label_id"] > 1)

    # Shuffle từng phần
    ds_label0 = ds_label0.shuffle(seed=42)
    ds_label1 = ds_label1.shuffle(seed=42)

    # Lấy đúng 50 mẫu mỗi loại
    ds_label0_50 = ds_label0.select(range(min(200, len(ds_label0))))
    ds_label1_50 = ds_label1.select(range(min(200, len(ds_label1))))

    # Gộp lại thành 100 mẫu
    ds_100 = datasets.concatenate_datasets([ds_label0_50, ds_label1_50])

    ds = ds_100.select(range(400))
    out = {
        "eval_set_id": EVAL_SET_ID,
        "name": NAME,
        "description": DESCRIPTION,
        "eval_cases": []
    }

    for i, ex in enumerate(ds):
        text = find_text_field(ex)

        label = None
        for key in ("label", "label_id"):
            if key in ex:
                label = ex[key]
                break

        if isinstance(label, (list, tuple)) and len(label) > 0:
            label = label[0]
        if isinstance(label, dict) and "label" in label:
            label = label["label"]

        final_answer = label_to_yesno(label)

        eval_id = str(uuid.uuid4())
        invocation_id = str(uuid.uuid4())

        eval_case = {
            "eval_id": eval_id,
            "conversation": [
                {
                    "invocation_id": invocation_id,
                    "user_content": {
                        "parts": [{"text": text}],
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
        }

        out["eval_cases"].append(eval_case)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(out['eval_cases'])} eval_cases to {OUT_FILE}")

if __name__ == "__main__":
    main()
