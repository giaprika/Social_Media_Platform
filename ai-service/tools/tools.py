import json
import base64
from .connect_db import create_violation_record, query_user_validations_count
from config.context import get_user_id, get_text_content, get_image_content
from .create_event import create_warning_event

def warning_user(user_id: str, message: str) -> None:
    """
    Sends a warning message to the user.
    Args:
        user_id (str): The ID of the user to warn.
        message (str): The warning message to send.

    """
    print(create_warning_event(user_id, "Warning Notification!", message))
    print(f"Warning sent to user {user_id}: {message}")
    return json.dumps({"status": "warning_user", "user_id": user_id, "message": message}) # type: ignore

def ban_user(user_id: str, reason: str) -> None:
    """
    Bans a user from the platform.
    Args:
        user_id (str): The ID of the user to ban.
        reason (str): The reason for banning the user.

    """
    print(f"User {user_id} has been banned for reason: {reason}")
    return json.dumps({"status": "user_banned", "user_id": user_id, "reason": reason}) # type: ignore

def report_user_violation( violation_type: str, description: str) -> None:
    """
    Reports a user violation and takes appropriate action based on the number of violations.
    Args:
        violation_type (str): The type of violation (e.g., "text", "image").
        description (str): A description of the violation.
    """
    try:
        text_content = get_text_content()
        image_content = get_image_content()
        user_id = get_user_id()
        user_id = "9b72d69d-32a4-44c7-b2f9-3f4a3b6e89f8" # For testing purpose only, remove this line in production
        violation_detail = create_violation_record(user_id, violation_type, description, text_content, image_content) # type: ignore
        violation_count = query_user_validations_count(user_id)
        print(f"User {user_id} violation reported: {violation_count}")
        if violation_count >= 10:
            result = ban_user(user_id, "Exceeded maximum number of violations.")
        else:
            result = warning_user(user_id, "You have committed a violation. Please adhere to community guidelines. If you continue to violate, you may be banned.")
        return json.dumps({"result": result, "violation_detail": violation_detail}) # type: ignore
    except Exception as e:
        print(f"Error reporting user violation: {e}")
        return json.dumps({"status": "error", "message": str(e)}) # type: ignore