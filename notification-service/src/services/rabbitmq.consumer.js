import amqp from "amqplib";
import Redis from "ioredis";
import crypto from "crypto";
import { NotificationService } from "../services/notification.service.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false"; // Default true, set REDIS_ENABLED=false to disable
const EXCHANGE_NAME = "social.events";
const QUEUE_NAME = "notification.queue";

// Khởi tạo Redis Client (optional)
let redis = null;
if (REDIS_ENABLED) {
  redis = new Redis(REDIS_URL);
  redis.on('error', (err) => {
    console.warn('[Redis] Connection error (continuing without Redis):', err.message);
    redis = null; // Disable redis on error
  });
  redis.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });
} else {
  console.log('[Redis] Disabled by configuration');
}

export class NotificationConsumer {
  static async start() {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      const channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
      const q = await channel.assertQueue(QUEUE_NAME, { durable: true });

      await channel.bindQueue(q.queue, EXCHANGE_NAME, "post.created");
      await channel.bindQueue(q.queue, EXCHANGE_NAME, "violation.events");

      // QUAN TRỌNG: Chỉ nhận 1 message tại 1 thời điểm để xử lý tuần tự (nếu cần)
      // await channel.prefetch(1); 

      console.log(`[*] Waiting for messages in ${q.queue}.`);

      channel.consume(q.queue, async (msg) => {
        if (!msg) return;

        const contentString = msg.content.toString();
        const content = JSON.parse(contentString);
        const routingKey = msg.fields.routingKey;

        // --- BẮT ĐẦU XỬ LÝ TRÙNG LẶP (chỉ khi Redis available) ---
        
        if (redis) {
          // Bước 1: Tạo ID duy nhất cho tin nhắn này
          const messageId = msg.properties.messageId || this.generateSignature(msg.content.toString());

          // Bước 2: Kiểm tra trong Redis
          try {
            const isNewMessage = await redis.set(`processed_msg:${messageId}`, "1", "EX", 3600, "NX");
            
            if (!isNewMessage) {
              console.warn(`[Duplicate] Message ${messageId} dropped.`);
              channel.ack(msg);
              return; 
            }
          } catch (redisErr) {
            console.warn('[Redis] Check failed, processing message anyway:', redisErr.message);
          }
        }
        // --- KẾT THÚC XỬ LÝ TRÙNG LẶP ---

        console.log(`[x] Received '${routingKey}':`, content);

        try {
          await this.handleMessage(routingKey, content);
          channel.ack(msg);
        } catch (error) {
          console.error("Error processing message:", error);
          // Nếu xử lý lỗi và muốn retry: xóa key trong Redis
          if (redis) {
            try {
              const messageId = msg.properties.messageId || this.generateSignature(msg.content.toString());
              await redis.del(`processed_msg:${messageId}`);
            } catch (redisErr) {
              console.warn('[Redis] Delete failed:', redisErr.message);
            }
          }
          
          // NACK để RabbitMQ gửi lại (hoặc đẩy vào Dead Letter Queue)
          channel.nack(msg, false, false); 
        }
      });
    } catch (error) {
      console.error("RabbitMQ Connection Error:", error);
    }
  }

  // Hàm tạo mã Hash MD5 từ nội dung tin nhắn
  static generateSignature(contentString) {
    return crypto.createHash('md5').update(contentString).digest('hex');
  }

  static async handleMessage(routingKey, eventData) {
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

  static async handleUserWarning(data) {
    await NotificationService.createNotificationToMultipleUsers({
      user_ids: [data.user_id],
      title_template: data.title_template,
      body_template: data.body_template,
    });
    console.log(`Warning sent to user ${data.user_id}`);
  }

  // Placeholder function
  static async handlePostCreated(data) {
      // Logic here
  }
}