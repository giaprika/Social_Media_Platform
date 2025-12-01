from config.database import create_connection, conn
import base64
import psycopg2
import json

def query_user_validations_count(user_id: str) -> int:
    """
    Queries the number of content violations for a given user.
    Args:
        user_id (str): The ID of the user to query.
    Returns:
        int: The number of violations.
    """
    # conn = create_connection()
    if conn is None:
        print("Database connection failed.")
        return 0
    try:
        cursor = conn.cursor()
        query = "SELECT COUNT(*) FROM violations WHERE user_id = %s;"
        cursor.execute(query, (user_id,))
        result = cursor.fetchone()
        violation_count = result[0] if result else 0
        cursor.close()
        return violation_count
    except Exception as e:
        print(f"Error querying violations: {e}")
        return 0
    # finally:
    #     conn.close()

def create_violation_record(user_id: str, description: str, text_content: str, image_content: base64) -> None:
    """
    Creates a new violation record in the database.
    Args:
        user_id (str): The ID of the user who committed the violation.
        description (str): A description of the violation.
        text_content (str): The text content that violated the policy.
        image_content (base64): The image content that violated the policy.
    """
    conn = create_connection()
    if conn is None:
        print("Database connection failed.")
        return
    try:
        cursor = conn.cursor()
        image_content = (base64.b64decode(image_content)) if image_content else None
        insert_query = """
        INSERT INTO violations (user_id, violation_type, description, text_content, image_content)
        VALUES (%s, %s, %s, %s, %s);
        """
        cursor.execute(insert_query, (user_id, description, text_content, image_content))
        conn.commit()
        cursor.close()
        print("Violation record created successfully.")
        return json.dumps({"status": "violation_record_created", "user_id": user_id, "description": description}) # type: ignore
    except Exception as e:
        print(f"Error creating violation record: {e}")
        return json.dumps({"status": "error", "message": str(e)})
    # finally:
    #     conn.close()