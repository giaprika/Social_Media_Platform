import os
import json
import aio_pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq")
EXCHANGE_NAME = "social.events"

async def publish_event(routing_key: str, message: dict):
    """
    Publish an event to RabbitMQ using the 'social.events' topic exchange.
    """
    try:
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            # Declare topic exchange (same as notification-service consumer)
            exchange = await channel.declare_exchange(
                EXCHANGE_NAME,
                aio_pika.ExchangeType.TOPIC,
                durable=True
            )
            await exchange.publish(
                aio_pika.Message(
                    body=bytes(json.dumps(message), encoding="utf-8"),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT
                ),
                routing_key=routing_key
            )
            print(f"[RabbitMQ] Published {routing_key}: {message}")
    except Exception as e:
        print(f"[RabbitMQ] Failed to publish {routing_key}: {str(e)}")
