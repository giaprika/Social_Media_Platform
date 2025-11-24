import pika
import os
import json
import uuid

# Cấu hình cứng để test
HOST = os.getenv('RABBITMQ_HOST', 'localhost')
PORT = int(os.getenv('RABBITMQ_PORT', 5672))
EXCHANGE = 'social.events'

print(f"Connecting to {HOST}:{PORT}...")

try:
    # 1. Tạo kết nối thô
    connection = pika.BlockingConnection(pika.ConnectionParameters(host=HOST, port=PORT))
    channel = connection.channel()

    # 2. Bật Confirm
    print("Enabling Confirm Delivery...")
    channel.confirm_delivery()
    print("Confirm Delivery Enabled!")

    # 3. Khai báo Exchange/Queue
    channel.exchange_declare(exchange=EXCHANGE, exchange_type='topic', durable=True)
    
    # 4. Gửi thử 1 tin
    msg_id = str(uuid.uuid4())
    print(f"Publishing message {msg_id}...")
    
    is_delivered = channel.basic_publish(
        exchange=EXCHANGE,
        routing_key='test.routing.key',
        body=json.dumps({"test": "data"}),
        properties=pika.BasicProperties(
            delivery_mode=2,
            content_type='application/json',
            message_id=msg_id
        ),
        mandatory=True
    )

    print("------------------------------------------------")
    print(f"KẾT QUẢ TRẢ VỀ: {is_delivered}")
    print(f"KIỂU DỮ LIỆU: {type(is_delivered)}")
    print("------------------------------------------------")

    connection.close()

except Exception as e:
    print(f"LỖI: {e}")