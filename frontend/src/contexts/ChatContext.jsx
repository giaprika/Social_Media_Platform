import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
} from 'react'
import * as chatApi from '../api/chat'
import chatWebSocket from '../services/chatWebSocket'
import useAuth from '../hooks/useAuth'

const ChatContext = createContext(null)

// Local storage key for cached participant info
const PARTICIPANTS_CACHE_KEY = 'chat_participants_cache'

// Helper to get/set participant cache
const getParticipantsCache = () => {
	try {
		const cached = localStorage.getItem(PARTICIPANTS_CACHE_KEY)
		return cached ? JSON.parse(cached) : {}
	} catch {
		return {}
	}
}

const setParticipantsCache = (cache) => {
	try {
		localStorage.setItem(PARTICIPANTS_CACHE_KEY, JSON.stringify(cache))
	} catch (e) {
		console.warn('Failed to cache participants:', e)
	}
}

export function ChatProvider({ children }) {
	const { user, authed } = useAuth()
	const [conversations, setConversations] = useState([])
	const [activeConversation, setActiveConversationState] = useState(null)
	const [messages, setMessages] = useState([])
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState(null)
	const [wsConnected, setWsConnected] = useState(false)
	const [participantsCache, setParticipantsCacheState] = useState(getParticipantsCache)
	const unsubscribeRefs = useRef([])

	// Calculate total unread count
	const unreadCount = conversations.reduce(
		(sum, conv) => sum + (conv.unread_count || 0),
		0
	)

	// Normalize conversation field names (API returns camelCase)
	const normalizeConversation = (conv) => ({
		id: conv.id,
		last_message_content: conv.lastMessageContent || conv.last_message_content,
		last_message_at: conv.lastMessageAt || conv.last_message_at,
		unread_count: conv.unreadCount ?? conv.unread_count ?? 0,
		// Preserve enriched data
		participants: conv.participants,
		recipient: conv.recipient,
		name: conv.name,
	})

	// Enrich conversations with cached participant info
	const enrichConversations = useCallback((convs) => {
		const cache = getParticipantsCache()
		return convs.map(conv => {
			const normalized = normalizeConversation(conv)
			const cachedData = cache[conv.id]
			if (cachedData) {
				return {
					...normalized,
					participants: cachedData.participants,
					recipient: cachedData.recipient,
				}
			}
			return normalized
		})
	}, [])

	// Load conversations
	const loadConversations = useCallback(async () => {
		try {
			setIsLoading(true)
			setError(null)
			const response = await chatApi.getConversations()
			console.log('[ChatContext] Raw conversations from API:', response)
			const rawConversations = response.conversations || []
			// Enrich with cached participant info
			const enriched = enrichConversations(rawConversations)
			console.log('[ChatContext] Enriched conversations:', enriched)
			setConversations(enriched)
		} catch (err) {
			console.error('Failed to load conversations:', err)
			setError(err.message || 'Failed to load conversations')
		} finally {
			setIsLoading(false)
		}
	}, [enrichConversations])

	// Load messages for a conversation
	const loadMessages = useCallback(async (conversationId, options = {}) => {
		try {
			setIsLoading(true)
			setError(null)
			const response = await chatApi.getMessages(conversationId, options)
			console.log('[ChatContext] Raw messages from API:', response)

			// Normalize field names (API returns camelCase, we use snake_case internally)
			const normalizeMessage = (msg) => ({
				id: msg.id,
				conversation_id: msg.conversationId || msg.conversation_id,
				sender_id: msg.senderId || msg.sender_id,
				content: msg.content,
				created_at: msg.createdAt || msg.created_at,
			})

			if (options.beforeTimestamp) {
				// Append older messages (pagination)
				setMessages((prev) => [...(response.messages || []).map(normalizeMessage), ...prev])
			} else {
				// Initial load - reverse to show oldest first
				const msgs = (response.messages || []).map(normalizeMessage).reverse()
				console.log('[ChatContext] Setting messages (normalized & reversed):', msgs)
				setMessages(msgs)
			}

			return response
		} catch (err) {
			console.error('Failed to load messages:', err)
			setError(err.message || 'Failed to load messages')
			throw err
		} finally {
			setIsLoading(false)
		}
	}, [])

	// Send a message
	const sendMessage = useCallback(
		async (conversationId, content) => {
			try {
				setError(null)
				const response = await chatApi.sendMessage(conversationId, content)

				// Optimistically add message to state
				const newMessage = {
					id: response.message_id,
					conversation_id: conversationId,
					sender_id: user?.id,
					content: content,
					created_at: new Date().toISOString(),
				}
				setMessages((prev) => [...prev, newMessage])

				// Refresh conversations to update last_message
				loadConversations()

				return response
			} catch (err) {
				console.error('Failed to send message:', err)
				setError(err.message || 'Failed to send message')
				throw err
			}
		},
		[user?.id, loadConversations]
	)

	// Mark conversation as read
	const markAsRead = useCallback(async (conversationId) => {
		try {
			await chatApi.markAsRead(conversationId)
			// Update local state
			setConversations((prev) =>
				prev.map((conv) =>
					conv.id === conversationId ? { ...conv, unread_count: 0 } : conv
				)
			)
		} catch (err) {
			console.error('Failed to mark as read:', err)
		}
	}, [])

	// Select a conversation
	const selectConversation = useCallback(
		async (conversation) => {
			// Preserve existing participant info when selecting
			const enrichedConv = conversation.recipient 
				? conversation 
				: enrichConversations([conversation])[0] || conversation
			
			setActiveConversationState(enrichedConv)
			setMessages([])

			if (conversation?.id) {
				await loadMessages(conversation.id)
				await markAsRead(conversation.id)
			}
		},
		[loadMessages, markAsRead, enrichConversations]
	)

	// Start a new conversation
	const startNewConversation = useCallback(
		async (recipientId, content, recipientInfo = null) => {
			try {
				if (!user?.id) {
					console.error('[ChatContext] User not authenticated, user:', user)
					throw new Error('User not authenticated')
				}
				
				console.log('[ChatContext] startNewConversation:', {
					currentUserId: user.id,
					recipientId,
					content,
					recipientInfo
				})
				
				// Pass current user ID to create deterministic conversation ID
				const result = await chatApi.startConversation(user.id, recipientId, content)
				
				console.log('[ChatContext] startNewConversation result:', result)

				// Cache participant info for this conversation
				if (recipientInfo || activeConversation?.recipient) {
					const recipient = recipientInfo || activeConversation?.recipient
					const cache = getParticipantsCache()
					cache[result.conversation_id] = {
						participants: [
							{ id: user.id, full_name: user.full_name, username: user.username, avatar_url: user.avatar_url },
							recipient
						],
						recipient: recipient
					}
					setParticipantsCache(cache)
					setParticipantsCacheState(cache)
				}

				// Reload conversations to get the new one
				const convResponse = await chatApi.getConversations()
				const rawConversations = convResponse.conversations || []
				const enriched = enrichConversations(rawConversations)
				setConversations(enriched)

				// Find the conversation with the returned ID
				let newConv = enriched.find(c => c.id === result.conversation_id)

				if (newConv) {
					// Ensure recipient info is preserved
					if (!newConv.recipient && (recipientInfo || activeConversation?.recipient)) {
						newConv = {
							...newConv,
							recipient: recipientInfo || activeConversation?.recipient,
							participants: [
								{ id: user.id, full_name: user.full_name, username: user.username },
								recipientInfo || activeConversation?.recipient
							]
						}
					}
					// Set as active conversation
					setActiveConversationState(newConv)

					// Optimistically add message to state
					const newMessage = {
						id: result.message_id,
						conversation_id: result.conversation_id,
						sender_id: user?.id,
						content: content,
						created_at: new Date().toISOString(),
					}
					setMessages([newMessage])

					return result
				}

				// If conversation not found in list, create a minimal version
				const minimalConv = {
					id: result.conversation_id,
					last_message_content: content,
					last_message_at: new Date().toISOString(),
					unread_count: 0,
					recipient: recipientInfo || activeConversation?.recipient,
					participants: [
						{ id: user.id, full_name: user.full_name, username: user.username },
						recipientInfo || activeConversation?.recipient
					]
				}
				setActiveConversationState(minimalConv)
				
				const newMessage = {
					id: result.message_id,
					conversation_id: result.conversation_id,
					sender_id: user?.id,
					content: content,
					created_at: new Date().toISOString(),
				}
				setMessages([newMessage])

				return result
			} catch (err) {
				console.error('Failed to start conversation:', err)
				setError(err.message || 'Failed to start conversation')
				throw err
			}
		},
		[user, activeConversation?.recipient, enrichConversations]
	)

	// Clear error
	const clearError = useCallback(() => {
		setError(null)
	}, [])

	// Connect WebSocket when authenticated
	useEffect(() => {
		if (authed && user?.id) {
			// Connect to WebSocket (will gracefully fallback to HTTP if fails)
			chatWebSocket
				.connect()
				.then(() => {
					const isConnected = chatWebSocket.isConnected()
					setWsConnected(isConnected)
					if (!isConnected) {
						console.log('[ChatContext] Using HTTP polling mode (WebSocket not available)')
					}
				})
				.catch((err) => {
					console.warn('[ChatContext] WebSocket setup failed, using HTTP mode:', err.message)
					setWsConnected(false)
				})

			// Subscribe to new messages (only works if WS is connected)
			const unsubMessage = chatWebSocket.on('message.sent', (data) => {
				console.log('[ChatContext] New message received via WS:', data)

				// Add new message to current conversation if it matches
				if (activeConversation?.id === data.conversation_id) {
					setMessages((prev) => {
						// Check if message already exists (prevent duplicates)
						if (prev.some((m) => m.id === data.message_id)) {
							return prev
						}
						return [
							...prev,
							{
								id: data.message_id,
								conversation_id: data.conversation_id,
								sender_id: data.sender_id,
								content: data.content,
								created_at: data.created_at,
							},
						]
					})
				}

				// Update conversation list
				loadConversations()
			})

			// Subscribe to connection events
			const unsubConnection = chatWebSocket.on('connection.failed', () => {
				console.log('[ChatContext] WebSocket connection lost, using HTTP mode')
				setWsConnected(false)
			})

			unsubscribeRefs.current = [unsubMessage, unsubConnection]

			return () => {
				unsubscribeRefs.current.forEach((unsub) => unsub?.())
				chatWebSocket.disconnect()
				setWsConnected(false)
			}
		}
	}, [authed, user?.id, activeConversation?.id, loadConversations])

	// Load conversations on mount when authenticated
	useEffect(() => {
		if (authed && user?.id) {
			console.log('[ChatContext] User authenticated, loading conversations. User:', {
				id: user.id,
				full_name: user.full_name,
				email: user.email
			})
			loadConversations()
		}
	}, [authed, user?.id, loadConversations])

	const value = {
		// State
		conversations,
		activeConversation,
		messages,
		unreadCount,
		isLoading,
		error,
		wsConnected,

		// Actions
		setActiveConversation: selectConversation,
		loadConversations,
		loadMessages,
		sendMessage,
		markAsRead,
		startNewConversation,
		clearError,

		// WebSocket
		isWebSocketConnected: () => chatWebSocket.isConnected(),
		sendTyping: (conversationId, isTyping) =>
			chatWebSocket.sendTyping(conversationId, isTyping),
	}

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
	const context = useContext(ChatContext)
	if (!context) {
		throw new Error('useChat must be used within ChatProvider')
	}
	return context
}

export default ChatContext
