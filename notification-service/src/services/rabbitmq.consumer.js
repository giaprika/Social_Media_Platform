import amqp from 'amqplib'
import Redis from 'ioredis'
import crypto from 'crypto'
import { NotificationService } from '../services/notification.service.js'

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false' // Default true, set REDIS_ENABLED=false to disable
const EXCHANGE_NAME = 'social.events'
const QUEUE_NAME = 'notification.queue'

// Khởi tạo Redis Client (optional)
let redis = null
if (REDIS_ENABLED) {
	redis = new Redis(REDIS_URL)
	redis.on('error', (err) => {
		console.warn(
			'[Redis] Connection error (continuing without Redis):',
			err.message
		)
		redis = null // Disable redis on error
	})
	redis.on('connect', () => {
		console.log('[Redis] Connected successfully')
	})
} else {
	console.log('[Redis] Disabled by configuration')
}

export class NotificationConsumer {
	static async start() {
		try {
			const connection = await amqp.connect(RABBITMQ_URL)
			const channel = await connection.createChannel()

			await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true })
			const q = await channel.assertQueue(QUEUE_NAME, { durable: true })

			await channel.bindQueue(q.queue, EXCHANGE_NAME, 'post.created')
			await channel.bindQueue(q.queue, EXCHANGE_NAME, 'violation.events')
			await channel.bindQueue(q.queue, EXCHANGE_NAME, 'user.followed')

			// Thêm các routing key mới cho các sự kiện
			await channel.bindQueue(q.queue, EXCHANGE_NAME, 'post.liked')
			await channel.bindQueue(q.queue, EXCHANGE_NAME, 'post.commented')
			await channel.bindQueue(q.queue, EXCHANGE_NAME, 'comment.replied')
			await channel.bindQueue(q.queue, EXCHANGE_NAME, 'community.joined')

			// QUAN TRỌNG: Chỉ nhận 1 message tại 1 thời điểm để xử lý tuần tự (nếu cần)
			// await channel.prefetch(1);

			console.log(`[*] Waiting for messages in ${q.queue}.`)

			channel.consume(q.queue, async (msg) => {
				if (!msg) return

				const contentString = msg.content.toString()
				const content = JSON.parse(contentString)
				const routingKey = msg.fields.routingKey

				// --- BẮT ĐẦU XỬ LÝ TRÙNG LẶP (chỉ khi Redis available) ---

				if (redis) {
					// Bước 1: Tạo ID duy nhất cho tin nhắn này
					const messageId =
						msg.properties.messageId ||
						this.generateSignature(msg.content.toString())

					// Bước 2: Kiểm tra trong Redis
					try {
						const isNewMessage = await redis.set(
							`processed_msg:${messageId}`,
							'1',
							'EX',
							3600,
							'NX'
						)

						if (!isNewMessage) {
							console.warn(`[Duplicate] Message ${messageId} dropped.`)
							channel.ack(msg)
							return
						}
					} catch (redisErr) {
						console.warn(
							'[Redis] Check failed, processing message anyway:',
							redisErr.message
						)
					}
				}
				// --- KẾT THÚC XỬ LÝ TRÙNG LẶP ---

				console.log(`[x] Received '${routingKey}':`, content)

				try {
					await this.handleMessage(routingKey, content)
					channel.ack(msg)
				} catch (error) {
					console.error('Error processing message:', error)
					// Nếu xử lý lỗi và muốn retry: xóa key trong Redis
					if (redis) {
						try {
							const messageId =
								msg.properties.messageId ||
								this.generateSignature(msg.content.toString())
							await redis.del(`processed_msg:${messageId}`)
						} catch (redisErr) {
							console.warn('[Redis] Delete failed:', redisErr.message)
						}
					}

					// NACK để RabbitMQ gửi lại (hoặc đẩy vào Dead Letter Queue)
					channel.nack(msg, false, false)
				}
			})
		} catch (error) {
			console.error('RabbitMQ Connection Error:', error)
			console.log('Retrying RabbitMQ connection in 5 seconds...')
			setTimeout(() => this.start(), 5000)
		}
	}

	// Hàm tạo mã Hash MD5 từ nội dung tin nhắn
	static generateSignature(contentString) {
		return crypto.createHash('md5').update(contentString).digest('hex')
	}

	static async handleMessage(routingKey, eventData) {
		switch (routingKey) {
			case 'violation.events':
				await this.handleUserWarning(eventData)
				break
			case 'post.created':
				await this.handlePostCreated(eventData)
				break
			case 'user.followed':
				await this.handleUserFollowed(eventData)
				break
			case 'post.liked':
				await this.handlePostLiked(eventData)
				break
			case 'post.commented':
				await this.handlePostCommented(eventData)
				break
			case 'comment.replied':
				await this.handleCommentReplied(eventData)
				break
			case 'community.joined':
				await this.handleCommunityJoined(eventData)
				break
			default:
				console.warn(`Unknown routing key: ${routingKey}`)
		}
	}

	static async handleUserWarning(data) {
		await NotificationService.createNotificationToMultipleUsers({
			user_ids: [data.user_id],
			title_template: data.title_template,
			body_template: data.body_template,
		})
		console.log(`Warning sent to user ${data.user_id}`)
	}

	// Post được tạo
	static async handlePostCreated(data) {
		// data: { user_id, post_id, post_title, ... }
		await NotificationService.createNotificationToMultipleUsers({
			user_ids: [data.user_id],
			title_template: data.title_template || 'Bài viết mới đã được tạo!',
			body_template: data.body_template || `Bài viết: ${data.post_title}`,
			link_url: data.link_url,
		})
		console.log(`Post created notification sent to user ${data.user_id}`)
	}

	// Có người follow
	static async handleUserFollowed(data) {
		await NotificationService.createNotificationToMultipleUsers({
			user_ids: [data.user_id],
			title_template: data.title_template || 'Bạn có người theo dõi mới!',
			body_template:
				data.body_template || `${data.follower_username} đã theo dõi bạn!`,
			link_url: data.link_url,
		})
		console.log(`Follow notification sent to user ${data.user_id}`)
	}

	// Ai đó like bài viết
	static async handlePostLiked(data) {
		await NotificationService.createNotificationToMultipleUsers({
			user_ids: [data.user_id],
			title_template: data.title_template || 'Bài viết của bạn được thích!',
			body_template:
				data.body_template ||
				`${data.liker_username} đã thích bài viết của bạn!`,
			link_url: data.link_url,
		})
		console.log(`Like notification sent to user ${data.user_id}`)
	}

	// Ai đó comment bài viết
	static async handlePostCommented(data) {
		await NotificationService.createNotificationToMultipleUsers({
			user_ids: [data.user_id],
			title_template:
				data.title_template || 'Bài viết của bạn có bình luận mới!',
			body_template:
				data.body_template ||
				`${data.commenter_username} đã bình luận: ${data.comment_content}`,
			link_url: data.link_url,
		})
		console.log(`Comment notification sent to user ${data.user_id}`)
	}

	// Ai đó reply comment
	static async handleCommentReplied(data) {
		await NotificationService.createNotificationToMultipleUsers({
			user_ids: [data.user_id],
			title_template:
				data.title_template || 'Bình luận của bạn có phản hồi mới!',
			body_template:
				data.body_template ||
				`${data.replier_username} đã phản hồi bình luận của bạn: ${data.reply_content}`,
			link_url: data.link_url,
		})
		console.log(`Reply notification sent to user ${data.user_id}`)
	}

	// Ai đó join community
	static async handleCommunityJoined(data) {
		await NotificationService.createNotificationToMultipleUsers({
			user_ids: [data.user_id],
			title_template: data.title_template || 'Bạn đã tham gia cộng đồng mới!',
			body_template:
				data.body_template ||
				`Bạn vừa tham gia cộng đồng: ${data.community_name}`,
			link_url: data.link_url,
		})
		console.log(`Community join notification sent to user ${data.user_id}`)
	}
}
