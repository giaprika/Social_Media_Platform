import amqp from "amqplib";
import axios from "axios";
import { NotificationService } from "../services/notification.service.js"; // Đường dẫn đến file service của bạn

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const EXCHANGE_NAME = "social.events";
const QUEUE_NAME = "notification.queue";

export class NotificationConsumer {
  static async start() {
    try {
      // 1. Kết nối RabbitMQ
      const connection = await amqp.connect(RABBITMQ_URL);
      const channel = await connection.createChannel();

      // 2. Khai báo Exchange (đảm bảo tồn tại)
      await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });

      // 3. Khai báo Queue riêng cho Notification Service
      const q = await channel.assertQueue(QUEUE_NAME, { durable: true });

      // 4. Bind Queue vào các Routing Key cần nghe
      // Nghe event tạo bài viết mới
      await channel.bindQueue(q.queue, EXCHANGE_NAME, "post.created");
      // Nghe event cảnh báo spam từ Python AI Agent
      await channel.bindQueue(q.queue, EXCHANGE_NAME, "violation.events");

      console.log(`[*] Waiting for messages in ${q.queue}.`);

      // 5. Xử lý tin nhắn đến
      channel.consume(q.queue, async (msg) => {
        if (!msg) return;

        const content = JSON.parse(msg.content.toString());
        const routingKey = msg.fields.routingKey;
        
        console.log(`[x] Received '${routingKey}':`, content);

        try {
          await this.handleMessage(routingKey, content);
          // Xác nhận đã xử lý xong (ACK)
          channel.ack(msg);
        } catch (error) {
          console.error("Error processing message:", error);
          // Nếu lỗi, có thể NACK để gửi lại hoặc log vào dead-letter
          // channel.nack(msg, false, false); 
        }
      });
    } catch (error) {
      console.error("RabbitMQ Connection Error:", error);
      // Retry logic nên được thêm vào đây (setTimeout connect lại)
    }
  }

  // Hàm điều hướng xử lý logic
  static async handleMessage(routingKey, eventData) {
    // const { data } = eventData;

    switch (routingKey) {
      case "violation.events":
        await this.handleUserWarning(eventData);
        break;
      
      case "post.created":
        await this.handlePostCreated(eventData);
        break;

      default:
        console.warn(`Unknown routing key: ${routingKey}`);
    }
  }

  // --- XỬ LÝ CÁC EVENT CỤ THỂ ---

  /**
   * Xử lý event từ Python Agent: Cảnh báo User vi phạm
   * Payload: { user_id, reason, timestamp }
   */
  static async handleUserWarning(data) {
    // Gọi NotificationService để tạo thông báo cho đúng 1 user đó
    await NotificationService.createNotificationToMultipleUsers({
      user_ids: [data.user_id],
      title_template: data.title_template,
      body_template: data.body_template,
    //   link_url: "/policy/violation-details"
    });
    console.log(`Warning sent to user ${data.user_id}`);
  }

}