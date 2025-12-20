import "dotenv/config";
import app from "./app.js";
import { RabbitMQProducer } from "./src/services/rabbitmq.producer.js";

const PORT = process.env.PORT || 3001;

// Connect to RabbitMQ before starting server
RabbitMQProducer.connect().then(() => {
  app.listen(PORT, () => {
    console.log(`User service đang chạy trên cổng ${PORT}`);
  });
});
