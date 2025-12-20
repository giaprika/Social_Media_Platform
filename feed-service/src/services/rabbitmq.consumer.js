const { getChannel, getQueueName } = require("../config/rabbitmq");
const feedService = require("./feed.service");
const logger = require("../utils/logger");

class RabbitMQConsumer {
  /**
   * Start consuming messages from RabbitMQ queue
   * Similar to notification-service pattern
   */
  async startConsuming() {
    try {
      const channel = getChannel();

      if (!channel) {
        logger.error("RabbitMQ channel not available");
        throw new Error("RabbitMQ channel not available");
      }

      const queueName = getQueueName();

      // Set prefetch to process one message at a time
      await channel.prefetch(1);

      logger.info(`[*] Waiting for messages in ${queueName}`);

      // Consume messages from the queue
      await channel.consume(queueName, async (msg) => {
        if (!msg) return;

        try {
          const content = JSON.parse(msg.content.toString());
          const routingKey = msg.fields.routingKey;

          logger.info(`[x] Received '${routingKey}':`, content);

          await this.handleMessage(routingKey, content);

          channel.ack(msg);
        } catch (error) {
          logger.error("Error processing message:", error);
          // Requeue message for retry
          channel.nack(msg, false, true);
        }
      });

      logger.info("RabbitMQ consumers started successfully");
    } catch (error) {
      logger.error("Failed to start RabbitMQ consumers:", error);
      throw error;
    }
  }

  /**
   * Handle messages based on routing key
   */
  async handleMessage(routingKey, eventData) {
    switch (routingKey) {
      case "post.created":
        await this.handlePostCreated(eventData);
        break;
      case "post.liked":
        await this.handlePostLiked(eventData);
        break;
      case "post.unliked":
        await this.handlePostUnliked(eventData);
        break;
      case "post.commented":
        await this.handlePostCommented(eventData);
        break;
      case "post.uncommented":
        await this.handlePostUncommented(eventData);
        break;
      default:
        logger.warn(`Unknown routing key: ${routingKey}`);
    }
  }

  /**
   * Handle post.created event - fanout to followers
   */
  async handlePostCreated(data) {
    const postData = {
      postId: data.post_id,
      authorId: data.user_id,
      content: data.post_title || data.body_template,
    };

    await feedService.fanoutPostToFollowers(postData);
    logger.info(`Post ${postData.postId} fanned out to followers`);
  }

  /**
   * Handle post.liked event - update score
   */
  async handlePostLiked(data) {
    const engagementData = {
      postId: data.post_id,
      likes: data.likes || 0,
      comments: data.comments || 0,
    };

    await feedService.updatePostScore(engagementData);
    logger.info(`Score updated for post ${engagementData.postId} (liked)`);
  }

  /**
   * Handle post.unliked event - update score
   */
  async handlePostUnliked(data) {
    const engagementData = {
      postId: data.post_id,
      likes: data.likes || 0,
      comments: data.comments || 0,
    };

    await feedService.updatePostScore(engagementData);
    logger.info(`Score updated for post ${engagementData.postId} (unliked)`);
  }

  /**
   * Handle post.commented event - update score
   */
  async handlePostCommented(data) {
    const engagementData = {
      postId: data.post_id,
      likes: data.likes || 0,
      comments: data.comments || 0,
    };

    await feedService.updatePostScore(engagementData);
    logger.info(`Score updated for post ${engagementData.postId} (commented)`);
  }

  /**
   * Handle post.uncommented event - update score
   */
  async handlePostUncommented(data) {
    const engagementData = {
      postId: data.post_id,
      likes: data.likes || 0,
      comments: data.comments || 0,
    };

    await feedService.updatePostScore(engagementData);
    logger.info(
      `Score updated for post ${engagementData.postId} (uncommented)`
    );
  }
}

module.exports = new RabbitMQConsumer();
