const amqp = require("amqplib");
const logger = require("../utils/logger");

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE_NAME = "social.events"; // Same as post-service and notification-service
const QUEUE_NAME = "feed.queue"; // Dedicated queue for feed-service

const ROUTING_KEYS = {
  POST_CREATED: "post.created",
  POST_LIKED: "post.liked",
  POST_UNLIKED: "post.unliked",
  POST_COMMENTED: "post.commented",
  POST_UNCOMMENTED: "post.uncommented",
  USER_FOLLOWED: "user.followed",
};

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare the topic exchange (same as notification-service)
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });

    // Declare feed service queue
    const q = await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Bind queue to exchange with routing keys
    await channel.bindQueue(q.queue, EXCHANGE_NAME, ROUTING_KEYS.POST_CREATED);
    await channel.bindQueue(q.queue, EXCHANGE_NAME, ROUTING_KEYS.POST_LIKED);
    await channel.bindQueue(q.queue, EXCHANGE_NAME, ROUTING_KEYS.POST_UNLIKED);
    await channel.bindQueue(
      q.queue,
      EXCHANGE_NAME,
      ROUTING_KEYS.POST_COMMENTED
    );
    await channel.bindQueue(
      q.queue,
      EXCHANGE_NAME,
      ROUTING_KEYS.POST_UNCOMMENTED
    );
    await channel.bindQueue(q.queue, EXCHANGE_NAME, ROUTING_KEYS.USER_FOLLOWED);

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
const getQueueName = () => QUEUE_NAME;

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
  getQueueName,
  closeRabbitMQ,
  EXCHANGE_NAME,
  QUEUE_NAME,
  ROUTING_KEYS,
};
