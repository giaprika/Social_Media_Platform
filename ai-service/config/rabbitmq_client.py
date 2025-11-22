import pika
import json
import os
import logging

# Cấu hình logging để debug dễ hơn
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RabbitMQClient:
    _instance = None

    def __new__(cls):
        """
        Singleton: Đảm bảo chỉ có 1 instance duy nhất tồn tại.
        """
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
        """
        Hàm nội bộ để thiết lập kết nối.
        """
        try:
            params = pika.ConnectionParameters(
                host=self._instance._config['host'],
                port=self._instance._config['port'],
                heartbeat=600,
                blocked_connection_timeout=300
            )
            self._connection = pika.BlockingConnection(params)
            self._channel = self._connection.channel()
            
            # Khai báo Exchange (Idempotent - chạy nhiều lần không sao)
            self._channel.exchange_declare(
                exchange=self._instance._config['exchange'], 
                exchange_type='topic', 
                durable=True
            )
            
            logger.info("Connected to RabbitMQ successfully.")
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            self._connection = None
            self._channel = None
            raise e

    def publish_event(self, routing_key, payload):
        """
        Hàm gửi event ra ngoài. Tự động reconnect nếu mất kết nối.
        """
        # 1. Kiểm tra kết nối, nếu chưa có hoặc bị đóng thì connect lại
        if self._connection is None or self._connection.is_closed:
            logger.info("Connection not found or closed. Reconnecting...")
            try:
                self._connect()
            except Exception:
                return "Failed", "Could not establish connection to RabbitMQ"

        # 2. Gửi tin nhắn
        try:
            self._channel.basic_publish(
                exchange=self._instance._config['exchange'],
                routing_key=routing_key,
                body=json.dumps(payload),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Persistent message
                    content_type='application/json'
                )
            )
            logger.info(f"Published event '{routing_key}'")
            return "Success", "Message published successfully"
        except Exception as e:
            logger.error(f"Error publishing message: {e}")
            # Reset connection để lần sau thử lại từ đầu
            self._connection = None 
            return "Failed", str(e)

    def close(self):
        if self._connection and not self._connection.is_closed:
            self._connection.close()
            logger.info("RabbitMQ connection closed.")