import amqp from "amqplib";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const EXCHANGE_NAME = "social.events";

export class RabbitMQProducer {
    static connection = null;
    static channel = null;

    static async connect() {
        try {
            this.connection = await amqp.connect(RABBITMQ_URL);
            this.channel = await this.connection.createChannel();

            await this.channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });

            console.log("[RabbitMQ] Producer connected and exchange asserted.");

            this.connection.on("close", () => {
                console.error("[RabbitMQ] Connection closed. Retrying...");
                setTimeout(this.connect.bind(this), 5000);
            });

            this.connection.on("error", (err) => {
                console.error("[RabbitMQ] Association error", err);
            });

        } catch (error) {
            console.error("[RabbitMQ] Failed to connect", error);
            setTimeout(this.connect.bind(this), 5000);
        }
    }

    static async publish(routingKey, message) {
        if (!this.channel) {
            console.error("[RabbitMQ] Channel not active. Message dropped:", message);
            return;
        }

        try {
            this.channel.publish(
                EXCHANGE_NAME,
                routingKey,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            );
            console.log(`[RabbitMQ] Published '${routingKey}'`);
        } catch (error) {
            console.error("[RabbitMQ] Failed to publish message", error);
        }
    }
}
