import pika
import json
import uuid

import pika
import json
import os
from config.rabbitmq_client import RabbitMQClient


def create_warning_event(user_id: str, title_template: str, body_template: str) -> dict:
    mq_client = RabbitMQClient()

    try:
        payload = {
            "event_type": "user_warning",
            "user_id": user_id,
            "title_template": title_template,
            "body_template": body_template
        }
        
        # [MỚI] publish_event giờ trả về tuple (success: bool, message: str, message_id: str)
        success, msg_response, msg_id = mq_client.publish_event(
            routing_key='violation.events',
            payload=payload
        )
        
        if success:
            print(f" [x] Sent violation event for user_id: {user_id} | MsgID: {msg_id}")
            return {"status": "success", "message": msg_response, "message_id": msg_id}
        else:
            print(f" [!] Failed to send event for user_id: {user_id}: {msg_response}")
            return {"status": "failed", "message": msg_response}

    except Exception as e:
        print(f"Error publishing violation event: {e}")
        return {"status": "error", "message": str(e)}
