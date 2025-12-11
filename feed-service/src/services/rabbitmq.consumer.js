const { getChannel, QUEUES } = require("../config/rabbitmq");
const feedService = require("./feed.service");
const logger = require("../utils/logger");

class RabbitMQConsumer {
  /**
   * Start consuming messages from RabbitMQ queues
   */
  async startConsuming() {
    const channel = getChannel();

    if (!channel) {
      logger.error("RabbitMQ channel not available");
      return;
    }

    // Set prefetch to process one message at a time
    await channel.prefetch(1);

    // Consume post.created messages (for fanout)
    await channel.consume(QUEUES.FEED_FANOUT, async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          logger.info("Received post.created message:", data);

          // Extract data from post-service format
          const postData = {
            postId: data.post_id,
            authorId: data.user_id,
            content: data.post_title || data.body_template,
          };

          await feedService.fanoutPostToFollowers(postData);

          channel.ack(msg);
        } catch (error) {
          logger.error("Error processing post.created message:", error);
          // Requeue message for retry
          channel.nack(msg, false, true);
        }
      }
    });

    // Consume post.liked messages
    await channel.consume(QUEUES.POST_LIKED, async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          logger.info("Received post.liked message:", data);

          const engagementData = {
            postId: data.post_id,
            likes: data.likes || 0,
            comments: data.comments || 0,
          };

          await feedService.updatePostScore(engagementData);

          channel.ack(msg);
        } catch (error) {
          logger.error("Error processing post.liked message:", error);
          channel.nack(msg, false, true);
        }
      }
    });

    // Consume post.unliked messages
    await channel.consume(QUEUES.POST_UNLIKED, async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          logger.info("Received post.unliked message:", data);

          const engagementData = {
            postId: data.post_id,
            likes: data.likes || 0,
            comments: data.comments || 0,
          };

          await feedService.updatePostScore(engagementData);

          channel.ack(msg);
        } catch (error) {
          logger.error("Error processing post.unliked message:", error);
          channel.nack(msg, false, true);
        }
      }
    });

    // Consume post.commented messages
    await channel.consume(QUEUES.POST_COMMENTED, async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          logger.info("Received post.commented message:", data);

          const engagementData = {
            postId: data.post_id,
            likes: data.likes || 0,
            comments: data.comments || 0,
          };

          await feedService.updatePostScore(engagementData);

          channel.ack(msg);
        } catch (error) {
          logger.error("Error processing post.commented message:", error);
          channel.nack(msg, false, true);
        }
      }
    });

    // Consume post.uncommented messages
    await channel.consume(QUEUES.POST_UNCOMMENTED, async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          logger.info("Received post.uncommented message:", data);

          const engagementData = {
            postId: data.post_id,
            likes: data.likes || 0,
            comments: data.comments || 0,
          };

          await feedService.updatePostScore(engagementData);

          channel.ack(msg);
        } catch (error) {
          logger.error("Error processing post.uncommented message:", error);
          channel.nack(msg, false, true);
        }
      }
    });

    logger.info("RabbitMQ consumers started successfully for all queues");
  }
}

module.exports = new RabbitMQConsumer();
