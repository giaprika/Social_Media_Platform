const amqp = require("amqplib");
const logger = require("../utils/logger");

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";

const EXCHANGES = {
  POST_EVENTS: "post.events",
  ENGAGEMENT_EVENTS: "engagement.events",
};

const QUEUES = {
  FEED_FANOUT: "post.created", // Direct binding to default exchange routing key
  FEED_SCORE_UPDATE: "feed.score.update",
  POST_LIKED: "post.liked", // Direct queue for default exchange
  POST_UNLIKED: "post.unliked",
  POST_COMMENTED: "post.commented",
  POST_UNCOMMENTED: "post.uncommented",
};

const ROUTING_KEYS = {
  POST_CREATED: "post.created",
  POST_LIKED: "post.liked",
  POST_UNLIKED: "post.unliked",
  POST_COMMENTED: "post.commented",
  POST_UNCOMMENTED: "post.uncommented",
};

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare queues for receiving messages from post-service default exchange
    // When post-service uses default_exchange.publish(routing_key="post.created"),
    // RabbitMQ routes the message to a queue named "post.created"
    await channel.assertQueue(QUEUES.FEED_FANOUT, { durable: true });
    await channel.assertQueue(QUEUES.POST_LIKED, { durable: true });
    await channel.assertQueue(QUEUES.POST_UNLIKED, { durable: true });
    await channel.assertQueue(QUEUES.POST_COMMENTED, { durable: true });
    await channel.assertQueue(QUEUES.POST_UNCOMMENTED, { durable: true });

    logger.info("RabbitMQ connected and queues configured successfully");

    connection.on("error", (err) => {
      logger.error("RabbitMQ connection error:", err);
    });

    connection.on("close", () => {
      logger.warn("RabbitMQ connection closed. Reconnecting...");
      setTimeout(connectRabbitMQ, 5000);
    });

    return channel;
  } catch (error) {
    logger.error("Failed to connect to RabbitMQ:", error);
    setTimeout(connectRabbitMQ, 5000);
  }
};

const getChannel = () => channel;

const closeRabbitMQ = async () => {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    logger.info("RabbitMQ connection closed");
  } catch (error) {
    logger.error("Error closing RabbitMQ connection:", error);
  }
};

module.exports = {
  connectRabbitMQ,
  getChannel,
  closeRabbitMQ,
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
};
