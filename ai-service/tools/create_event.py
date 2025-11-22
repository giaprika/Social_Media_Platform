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
        
        success, message = mq_client.publish_event(
            routing_key='violation.events',
            payload=payload
        )
        
        print(f" [x] Sent violation event for user_id: {user_id}")
        return {"status": success, "message": message}
    except Exception as e:
        print(f"Error publishing violation event: {e}")
        return {"status": "error", "message": str(e)}
