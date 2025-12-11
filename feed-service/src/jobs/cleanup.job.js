const cron = require("node-cron");
const feedService = require("../services/feed.service");
const logger = require("../utils/logger");

class CleanupJob {
  constructor() {
    this.cronSchedule = process.env.CLEANUP_CRON_SCHEDULE || "0 */12 * * *"; // Every 12 hours
    this.daysThreshold = parseInt(process.env.CLEANUP_DAYS_THRESHOLD) || 10;
  }

  /**
   * Start the scheduled cleanup job
   */
  start() {
    logger.info(`Starting cleanup job with schedule: ${this.cronSchedule}`);
    logger.info(`Cleanup threshold: ${this.daysThreshold} days`);

    cron.schedule(this.cronSchedule, async () => {
      try {
        logger.info("Running scheduled cleanup job...");

        const result = await feedService.cleanupOldFeedItems(
          this.daysThreshold
        );

        logger.info(
          `Cleanup job completed: ${result.deletedCount} items deleted`
        );
      } catch (error) {
        logger.error("Error in scheduled cleanup job:", error);
      }
    });

    logger.info("Cleanup job scheduled successfully");
  }

  /**
   * Run cleanup immediately (for testing)
   */
  async runNow() {
    try {
      logger.info("Running immediate cleanup...");
      const result = await feedService.cleanupOldFeedItems(this.daysThreshold);
      logger.info(
        `Immediate cleanup completed: ${result.deletedCount} items deleted`
      );
      return result;
    } catch (error) {
      logger.error("Error in immediate cleanup:", error);
      throw error;
    }
  }
}

module.exports = new CleanupJob();
