import pika
import json
import os
import logging
import time # [MỚI] Cần time để sleep khi retry
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RabbitMQClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RabbitMQClient, cls).__new__(cls)
            cls._instance._connection = None
            cls._instance._channel = None
            cls._instance._config = {
                'host': os.getenv('RABBITMQ_HOST', 'localhost'),
                'port': int(os.getenv('RABBITMQ_PORT', 5672)),
                'exchange': 'social.events'
            }
        return cls._instance

    def _connect(self):
        try:
            params = pika.ConnectionParameters(
                host=self._instance._config['host'],
                port=self._instance._config['port'],
                heartbeat=600,
                blocked_connection_timeout=300,
                socket_timeout=10
            )
            self._connection = pika.BlockingConnection(params)
            self._channel = self._connection.channel()
            
            # Bật chế độ xác nhận. Khi bật cái này, RabbitMQ phải trả lời ACK 
            self._channel.confirm_delivery() 

            self._channel.exchange_declare(
                exchange=self._instance._config['exchange'], 
                exchange_type='topic', 
                durable=True
            )
            
            logger.info("Connected to RabbitMQ (Publisher Confirms Enabled).")
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            self._connection = None
            self._channel = None
            raise e

    def publish_event(self, routing_key, payload, max_retries=3):
        message_id = str(uuid.uuid4())
        retries = 0
        delay = 1 

        while retries <= max_retries:
            try:
                if self._connection is None or self._connection.is_closed:
                    logger.info(f"[Retry {retries}] Connecting...")
                    self._connect()

                # Gửi tin
                is_delivered = self._channel.basic_publish(
                    exchange=self._instance._config['exchange'],
                    routing_key=routing_key,
                    body=json.dumps(payload),
                    properties=pika.BasicProperties(
                        delivery_mode=2,
                        content_type='application/json',
                        message_id=message_id
                    ),
                    mandatory=True
                )

                print(f"Published message with ID: {message_id}", "is_delivered:", is_delivered)
                
                if is_delivered is False:
                    # Chỉ coi là lỗi nghiêm trọng nếu Server trả lời thẳng thừng là "NO" (False)
                    logger.warning(f"RabbitMQ NACKed (Rejected) [ID: {message_id}]")
                    raise Exception("NACK received")
                else:
                    # Nếu là True hoặc None -> Coi như thành công để tránh gửi lại (Spam)
                    logger.info(f"Published OK [ID: {message_id}]")
                    return True, "Success", message_id

            except Exception as e:
                retries += 1
                logger.error(f"Attempt {retries}/{max_retries} logic error: {e}")
                
                if retries > max_retries:
                    self.save_failed_message_to_disk(routing_key, payload) 
                    return False, str(e), message_id
                
                self._connection = None 
                time.sleep(delay)
                delay *= 2
    
    def _backup_to_file(self, routing_key, payload):
        """Hàm dự phòng cuối cùng: Ghi ra file nếu RabbitMQ chết hẳn"""
        try:
            with open("failed_messages.log", "a") as f:
                f.write(json.dumps({"time": time.time(), "key": routing_key, "data": payload}) + "\n")
        except:
            pass

    def close(self):
        if self._connection and not self._connection.is_closed:
            self._connection.close()
            logger.info("RabbitMQ connection closed.")