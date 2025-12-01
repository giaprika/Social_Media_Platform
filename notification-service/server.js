import "dotenv/config";
import app from "./app.js";
import { NotificationConsumer } from "./src/services/rabbitmq.consumer.js";

const PORT = process.env.PORT || 8002;

app.listen(PORT, () => {
  console.log(`Notification service đang chạy trên cổng ${PORT}`);
  // Khởi động RabbitMQ Consumer
  NotificationConsumer.start();
});
