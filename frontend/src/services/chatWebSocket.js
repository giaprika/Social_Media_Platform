import Cookies from 'universal-cookie'

const CHAT_WS_URL =
	process.env.REACT_APP_CHAT_WS_URL || 'ws://34.158.60.36:8081'

// Feature flag to enable/disable WebSocket
// Set to false to use HTTP polling instead
const WEBSOCKET_ENABLED = false

class ChatWebSocketService {
	constructor() {
		this.ws = null
		this.listeners = new Map()
		this.reconnectAttempts = 0
		this.maxReconnectAttempts = 3 // Reduced from 5
		this.reconnectDelay = 2000
		this.isConnecting = false
		this.pingInterval = null
		this.enabled = WEBSOCKET_ENABLED
	}

	/**
	 * Connect to WebSocket server
	 * @returns {Promise<void>}
	 */
	connect() {
		return new Promise((resolve, reject) => {
			// If WebSocket is disabled, resolve immediately (fallback to polling)
			if (!this.enabled) {
				console.log('[ChatWS] WebSocket disabled, using HTTP polling mode')
				resolve()
				return
			}

			if (this.ws?.readyState === WebSocket.OPEN) {
				resolve()
				return
			}

			if (this.isConnecting) {
				reject(new Error('Already connecting'))
				return
			}

			this.isConnecting = true
			const cookies = new Cookies()
			const userId = cookies.get('x-user-id')
			const accessToken = cookies.get('accessToken')

			if (!userId || !accessToken) {
				this.isConnecting = false
				console.warn('[ChatWS] Not authenticated, falling back to HTTP mode')
				resolve() // Don't reject, just continue without WS
				return
			}

			const wsUrl = `${CHAT_WS_URL}/ws?user_id=${userId}&token=${accessToken}`
			console.log('[ChatWS] Connecting to:', wsUrl.replace(accessToken, '***'))

			try {
				this.ws = new WebSocket(wsUrl)
			} catch (error) {
				this.isConnecting = false
				console.warn(
					'[ChatWS] Failed to create WebSocket, falling back to HTTP mode:',
					error.message
				)
				resolve() // Don't reject, just continue without WS
				return
			}

			// Set connection timeout
			const connectionTimeout = setTimeout(() => {
				if (this.isConnecting) {
					console.warn('[ChatWS] Connection timeout, falling back to HTTP mode')
					this.isConnecting = false
					this.ws?.close()
					resolve() // Don't reject, just continue without WS
				}
			}, 5000)

			this.ws.onopen = () => {
				clearTimeout(connectionTimeout)
				console.log('[ChatWS] Connected')
				this.isConnecting = false
				this.reconnectAttempts = 0
				this.startPing()
				resolve()
			}

			this.ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data)
					console.log('[ChatWS] Received:', data.event_type)
					this.notifyListeners(data.event_type, data)
				} catch (error) {
					console.error('[ChatWS] Failed to parse message:', error)
				}
			}

			this.ws.onclose = (event) => {
				clearTimeout(connectionTimeout)
				console.log('[ChatWS] Closed:', event.code, event.reason || '')
				this.isConnecting = false
				this.stopPing()

				// Only attempt reconnect if we were previously connected
				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					this.handleReconnect()
				}
			}

			this.ws.onerror = (error) => {
				clearTimeout(connectionTimeout)
				console.warn('[ChatWS] Error occurred, will fall back to HTTP mode')
				this.isConnecting = false
				// Don't reject - just resolve and fall back to HTTP mode
				resolve()
			}
		})
	}

	/**
	 * Start ping interval to keep connection alive
	 */
	startPing() {
		this.stopPing()
		this.pingInterval = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) {
				this.ws.send(JSON.stringify({ type: 'ping' }))
			}
		}, 30000) // Ping every 30 seconds
	}

	/**
	 * Stop ping interval
	 */
	stopPing() {
		if (this.pingInterval) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
	}

	/**
	 * Handle automatic reconnection
	 */
	handleReconnect() {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++
			const delay =
				this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
			console.log(
				`[ChatWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
			)

			setTimeout(() => {
				this.connect().catch((err) =>
					console.error('[ChatWS] Reconnect failed:', err)
				)
			}, delay)
		} else {
			console.log('[ChatWS] Max reconnect attempts reached')
			this.notifyListeners('connection.failed', {
				event_type: 'connection.failed',
			})
		}
	}

	/**
	 * Disconnect from WebSocket server
	 */
	disconnect() {
		console.log('[ChatWS] Disconnecting...')
		this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
		this.stopPing()
		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
	}

	/**
	 * Subscribe to an event type
	 * @param {string} eventType - Event type (e.g., 'message.sent')
	 * @param {Function} callback - Callback function
	 * @returns {Function} Unsubscribe function
	 */
	on(eventType, callback) {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set())
		}
		this.listeners.get(eventType).add(callback)

		// Return unsubscribe function
		return () => {
			this.listeners.get(eventType)?.delete(callback)
		}
	}

	/**
	 * Subscribe to all events
	 * @param {Function} callback - Callback function
	 * @returns {Function} Unsubscribe function
	 */
	onAny(callback) {
		return this.on('*', callback)
	}

	/**
	 * Notify all listeners for an event type
	 * @param {string} eventType - Event type
	 * @param {Object} data - Event data
	 */
	notifyListeners(eventType, data) {
		// Notify specific event listeners
		this.listeners.get(eventType)?.forEach((callback) => {
			try {
				callback(data)
			} catch (error) {
				console.error('[ChatWS] Listener error:', error)
			}
		})

		// Notify wildcard listeners
		this.listeners.get('*')?.forEach((callback) => {
			try {
				callback(data)
			} catch (error) {
				console.error('[ChatWS] Listener error:', error)
			}
		})
	}

	/**
	 * Send a message through WebSocket
	 * @param {Object} data - Data to send
	 */
	send(data) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(data))
		} else {
			console.warn('[ChatWS] Cannot send, not connected')
		}
	}

	/**
	 * Send typing indicator
	 * @param {string} conversationId - Conversation ID
	 * @param {boolean} isTyping - Whether user is typing
	 */
	sendTyping(conversationId, isTyping) {
		this.send({
			type: isTyping ? 'typing.start' : 'typing.stop',
			conversation_id: conversationId,
		})
	}

	/**
	 * Check if connected
	 * @returns {boolean}
	 */
	isConnected() {
		return this.ws?.readyState === WebSocket.OPEN
	}

	/**
	 * Get connection state
	 * @returns {string} - 'connecting' | 'connected' | 'disconnected'
	 */
	getState() {
		if (this.isConnecting) return 'connecting'
		if (this.ws?.readyState === WebSocket.OPEN) return 'connected'
		return 'disconnected'
	}
}

// Export singleton instance
export const chatWebSocket = new ChatWebSocketService()
export default chatWebSocket
