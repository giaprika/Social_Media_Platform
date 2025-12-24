import chatApi from './chatAxios'
import { filterOffensiveContent } from '../utils/contentFilter'

// API paths - direct to chat service (no gateway prefix)
const CHAT_PATH = ''

export const CHAT_MESSAGE_TYPES = {
	TEXT: 'MESSAGE_TYPE_TEXT',
	IMAGE: 'MESSAGE_TYPE_IMAGE',
	VIDEO: 'MESSAGE_TYPE_VIDEO',
	FILE: 'MESSAGE_TYPE_FILE',
}

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
const generateUUID = () => {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0
		const v = c === 'x' ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

/**
 * Generate a deterministic conversation ID from two user IDs
 * This ensures both users get the same conversation ID
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {string} Deterministic conversation ID (UUID format)
 */
export const generateConversationIdForUsers = (userId1, userId2) => {
	// Sort user IDs to ensure consistent ordering
	const sortedIds = [userId1, userId2].sort()
	const combined = `${sortedIds[0]}-${sortedIds[1]}`

	// Create a simple hash and format as UUID
	let hash = 0
	for (let i = 0; i < combined.length; i++) {
		const char = combined.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // Convert to 32bit integer
	}

	// Convert hash to hex parts for UUID
	const hex = Math.abs(hash).toString(16).padStart(8, '0')

	// Generate UUID-like format using hash + parts of original IDs
	const id1Part = userId1.replace(/-/g, '').substring(0, 12)
	const id2Part = userId2.replace(/-/g, '').substring(0, 12)

	// Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (UUID v4 format)
	return `${hex}-${id1Part.substring(0, 4)}-4${id1Part.substring(
		4,
		7
	)}-a${id2Part.substring(0, 3)}-${id2Part.substring(3, 15).padEnd(12, '0')}`
}

/**
 * Send a message in a conversation
 * @param {string} conversationId - Conversation ID (UUID)
 * @param {string} content - Message content
 * @param {string[]} [receiverIds] - Optional array of receiver user IDs (for adding participants)
 * @returns {Promise<{message_id: string, status: string}>}
 */

export const sendMessage = async (
	conversationId,
	content = '',
	receiverIds = null,
	options = {}
) => {
	// ✨ Filter offensive content before sending
	const normalizedContent = typeof content === 'string' ? content : ''
	const filteredContent = await filterOffensiveContent(normalizedContent)
	const { type, mediaUrl } = options || {}

	const payload = {
		conversation_id: conversationId,
		content: filteredContent, // Use filtered content
		idempotency_key: generateUUID(),
	}

	if (type) {
		payload.type = type
	}

	if (mediaUrl) {
		payload.media_url = mediaUrl
	}

	// Add receiver_ids if provided (this adds recipients as participants)
	if (receiverIds && receiverIds.length > 0) {
		payload.receiver_ids = receiverIds
	}

	const response = await chatApi.post(`/v1/messages`, payload)
	return response.data
}

export const getUploadCredentials = async () => {
	const response = await chatApi.get(`/v1/upload-credentials`)
	return response.data
}

/**
 * Get messages for a conversation with cursor-based pagination
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Pagination options
 * @param {string} [options.beforeTimestamp] - Get messages before this timestamp (RFC3339)
 * @param {number} [options.limit=50] - Number of messages (max 100)
 * @returns {Promise<{messages: Array, next_cursor: string}>}
 */
export const getMessages = async (
	conversationId,
	{ beforeTimestamp, limit = 50 } = {}
) => {
	const params = new URLSearchParams()
	if (beforeTimestamp) params.append('before_timestamp', beforeTimestamp)
	if (limit) params.append('limit', limit.toString())

	const queryString = params.toString()
	const url = `/v1/conversations/${conversationId}/messages${
		queryString ? '?' + queryString : ''
	}`

	const response = await chatApi.get(url)
	return response.data
}

/**
 * Get all conversations for current user with pagination
 * @param {Object} options - Pagination options
 * @param {string} [options.cursor] - Pagination cursor
 * @param {number} [options.limit=20] - Number of conversations
 * @returns {Promise<{conversations: Array, next_cursor: string}>}
 */
export const getConversations = async ({ cursor, limit = 20 } = {}) => {
	const params = new URLSearchParams()
	if (cursor) params.append('cursor', cursor)
	if (limit) params.append('limit', limit.toString())

	const queryString = params.toString()
	const url = `/v1/conversations${queryString ? '?' + queryString : ''}`

	const response = await chatApi.get(url)
	return response.data
}

/**
 * Mark all messages in a conversation as read
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<{success: boolean}>}
 */
export const markAsRead = async (conversationId) => {
	const response = await chatApi.post(
		`/v1/conversations/${conversationId}/read`
	)
	return response.data
}

/**
 * Generate a new conversation ID
 * @returns {string} Conversation ID (UUID format)
 */
export const generateConversationId = () => {
	return generateUUID()
}

/**
 * Start a new conversation with a user
 * @param {string} currentUserId - Current user ID
 * @param {string} recipientId - Recipient user ID
 * @param {string} content - Initial message content
 * @returns {Promise<{message_id: string, status: string, conversation_id: string}>}
 */
export const startConversation = async (
	currentUserId,
	recipientId,
	content = '',
	options = {}
) => {
	// Generate deterministic conversation ID from both user IDs
	const conversationId = generateConversationIdForUsers(
		currentUserId,
		recipientId
	)

	const normalizedContent = typeof content === 'string' ? content : ''
	const filteredContent = await filterOffensiveContent(normalizedContent)
	const { type, mediaUrl } = options || {}

	const payload = {
		conversation_id: conversationId,
		content: filteredContent,
		idempotency_key: generateUUID(),
		receiver_ids: [recipientId], // Add recipient as participant
	}

	if (type) {
		payload.type = type
	}

	if (mediaUrl) {
		payload.media_url = mediaUrl
	}

	const response = await chatApi.post(`/v1/messages`, payload)

	return {
		...response.data,
		conversation_id: conversationId,
	}
}

export default {
	sendMessage,
	getMessages,
	getConversations,
	markAsRead,
	generateConversationId,
	startConversation,
	generateConversationIdForUsers,
	generateUUID,
	getUploadCredentials,
	CHAT_MESSAGE_TYPES,
}
