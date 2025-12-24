import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
	useMemo,
} from 'react'
import * as chatApi from '../api/chat'
import * as userApi from '../api/user'
import chatWebSocket from '../services/chatWebSocket'
import useAuth from '../hooks/useAuth'

const ChatContext = createContext(null)

// Local storage key for cached participant info
const PARTICIPANTS_CACHE_KEY = 'chat_participants_cache'

const normalizeId = (value) =>
	value ? String(value).toLowerCase() : ''

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

	const getConversationUnread = useCallback(
		(conv) => {
			if (!conv) return 0
			const baseUnread =
				typeof conv.unread_count === 'number'
					? conv.unread_count
					: typeof conv.unreadCount === 'number'
					?
						conv.unreadCount
					: 0

			if (!baseUnread) return 0

			if (activeConversation?.id && conv.id === activeConversation.id) {
				return 0
			}

			const lastSenderRaw =
				conv.last_message_sender_id ??
				conv.lastMessageSenderId ??
				(typeof conv.last_message_sender === 'object'
					? conv.last_message_sender?.id
					: conv.last_message_sender) ??
				(typeof conv.lastMessageSender === 'object'
					? conv.lastMessageSender?.id
					: conv.lastMessageSender)

			if (
				lastSenderRaw &&
				user?.id &&
				normalizeId(lastSenderRaw) === normalizeId(user.id)
			) {
				return 0
			}

			return baseUnread
		},
		[activeConversation?.id, user?.id]
	)

	// Calculate total unread count (adjusted)
	const unreadCount = useMemo(
		() =>
			conversations.reduce((sum, conv) => sum + getConversationUnread(conv), 0),
		[conversations, getConversationUnread]
	)

	// Normalize conversation field names (API returns camelCase)
	const normalizeConversation = (conv) => ({
		id: conv.id,
		last_message_content: conv.lastMessageContent || conv.last_message_content,
		last_message_at: conv.lastMessageAt || conv.last_message_at,
		last_message_sender_id: conv.lastMessageSenderId || conv.last_message_sender_id,
		last_message_type: conv.lastMessageType || conv.last_message_type,
		last_message_media_url:
			conv.lastMessageMediaUrl || conv.last_message_media_url,
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
			setConversations((prev) => {
				if (!prev || prev.length === 0) {
					return enriched
				}
				const prevMap = new Map(prev.map((conv) => [conv.id, conv]))
				return enriched.map((conv) => {
					const existing = prevMap.get(conv.id)
					if (!existing) {
						return conv
					}
					return {
						...existing,
						...conv,
						last_message_type:
							conv.last_message_type ?? existing.last_message_type ?? null,
						last_message_media_url:
							conv.last_message_media_url ?? existing.last_message_media_url ?? null,
					}
				})
			})
		} catch (err) {
			console.error('Failed to load conversations:', err)
			setError(err.message || 'Failed to load conversations')
		} finally {
			setIsLoading(false)
		}
	}, [enrichConversations])

	// Fetch user info and cache it
	const fetchAndCacheUser = useCallback(async (userId) => {
		if (!userId) return null
		
		// Check cache first
		const cache = getParticipantsCache()
		const cachedUser = cache[`user_${userId}`]
		if (cachedUser) return cachedUser

		try {
			const response = await userApi.getUserById(userId)
			const userData = response.data
			if (userData) {
				// Cache user info
				cache[`user_${userId}`] = {
					id: userData.id,
					full_name: userData.full_name,
					username: userData.username,
					avatar_url: userData.avatar_url
				}
				setParticipantsCache(cache)
				return cache[`user_${userId}`]
			}
		} catch (err) {
			console.warn('[ChatContext] Failed to fetch user info:', userId, err)
		}
		return null
	}, [])

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
				type: msg.type || msg.message_type,
				media_url: msg.mediaUrl || msg.media_url,
				media_metadata: msg.mediaMetadata || msg.media_metadata,
			})

			if (options.beforeTimestamp) {
				// Append older messages (pagination)
				const olderMsgs = (response.messages || []).map(normalizeMessage)
				setMessages((prev) => {
					// Deduplicate when adding older messages
					const existingIds = new Set(prev.map(m => m.id))
					const uniqueOlder = olderMsgs.filter(m => !existingIds.has(m.id))
					return [...uniqueOlder, ...prev]
				})
			} else {
				// Initial load or polling - smart merge
				const msgs = (response.messages || []).map(normalizeMessage).reverse()
				console.log('[ChatContext] Messages from API (reversed):', msgs.length)
				
				setMessages((prev) => {
					if (prev.length === 0) {
						return msgs
					}
					
					// Create a map of existing messages by ID for quick lookup
					const existingMap = new Map(prev.map(m => [m.id, m]))
					
					// Merge: keep all unique messages, sorted by created_at
					msgs.forEach(m => {
						if (existingMap.has(m.id)) {
							existingMap.set(m.id, { ...existingMap.get(m.id), ...m })
						} else {
							existingMap.set(m.id, m)
						}
					})
					
					// Convert back to array and sort by created_at
					const merged = Array.from(existingMap.values()).sort((a, b) => 
						new Date(a.created_at) - new Date(b.created_at)
					)
					
					// Only update if there are actual changes
					if (merged.length === prev.length) {
						return prev
					}
					
					console.log('[ChatContext] Merged messages:', prev.length, '->', merged.length)
					return merged
				})

				// Extract unique sender IDs to identify participants
				if (msgs.length > 0) {
					const senderIds = [...new Set(msgs.map(m => m.sender_id).filter(Boolean))]
					console.log('[ChatContext] Found sender IDs:', senderIds)

					// Fetch user info for unknown senders (not current user)
					const otherSenderIds = senderIds.filter(id => 
						id && String(id).toLowerCase() !== String(user?.id).toLowerCase()
					)

					if (otherSenderIds.length > 0) {
						// Fetch and cache other participants' info
						const otherUsers = await Promise.all(
							otherSenderIds.map(id => fetchAndCacheUser(id))
						)
						const validOtherUsers = otherUsers.filter(Boolean)

						if (validOtherUsers.length > 0) {
							// Update conversation with participant info
							const cache = getParticipantsCache()
							cache[conversationId] = {
								participants: [
									{ id: user?.id, full_name: user?.full_name, username: user?.username, avatar_url: user?.avatar_url },
									...validOtherUsers
								],
								recipient: validOtherUsers[0] // For direct chat, first other user is recipient
							}
							setParticipantsCache(cache)

							// Update conversations state with new participant info
							setConversations((prev) =>
								prev.map((conv) =>
									conv.id === conversationId
										? { 
											...conv, 
											recipient: validOtherUsers[0],
											participants: cache[conversationId].participants,
											last_message_sender_id: msgs[msgs.length - 1].sender_id
										}
										: conv
								)
							)

							// Also update activeConversation if it's the current one
							setActiveConversationState((prev) => {
								if (prev?.id === conversationId) {
									return {
										...prev,
										recipient: validOtherUsers[0],
										participants: cache[conversationId].participants,
									}
								}
								return prev
							})
						}
					}

					// Update last message info
					const lastMsg = msgs[msgs.length - 1]
					setConversations((prev) =>
						prev.map((conv) =>
							conv.id === conversationId
								? {
									...conv,
									last_message_sender_id: lastMsg.sender_id,
									last_message_content: lastMsg.content,
									last_message_at: lastMsg.created_at,
									last_message_type:
										lastMsg.type ?? conv.last_message_type ?? null,
									last_message_media_url:
										lastMsg.media_url ?? conv.last_message_media_url ?? null,
								}
								: conv
						)
					)
				}
			}

			return response
		} catch (err) {
			console.error('Failed to load messages:', err)
			setError(err.message || 'Failed to load messages')
			throw err
		} finally {
			setIsLoading(false)
		}
	}, [user, fetchAndCacheUser])

	// Send a message
	const sendMessage = useCallback(
		async (
			conversationId,
			content,
			recipientId = null,
			messageOptions = {}
		) => {
			try {
				setError(null)
				
				// If recipientId not provided, try to get from current messages
				let finalRecipientId = recipientId
				if (!finalRecipientId && messages.length > 0) {
					// Find any sender that isn't the current user
					const otherSender = messages.find(m => 
						m.sender_id && String(m.sender_id).toLowerCase() !== String(user?.id).toLowerCase()
					)
					if (otherSender) {
						finalRecipientId = otherSender.sender_id
						console.log('[ChatContext] Got recipient from messages:', finalRecipientId)
					}
				}
				
				// Always include receiver_ids to ensure recipient is added as participant
				const receiverIds = finalRecipientId ? [finalRecipientId] : null
				console.log('[ChatContext] Sending message with receiverIds:', receiverIds)
				const response = await chatApi.sendMessage(
					conversationId,
					content,
					receiverIds,
					messageOptions
				)
				
				// API returns messageId (camelCase), normalize to message_id
				const messageId = response.messageId || response.message_id
				console.log('[ChatContext] Message sent, ID:', messageId)
				const resolvedType =
					messageOptions?.type ||
					response.type ||
					chatApi.CHAT_MESSAGE_TYPES?.TEXT ||
					'MESSAGE_TYPE_TEXT'
				const resolvedMediaUrl =
					messageOptions?.mediaUrl ||
					response.mediaUrl ||
					response.media_url ||
					null
				const resolvedMediaMetadata =
					messageOptions?.mediaMetadata ||
					response.mediaMetadata ||
					response.media_metadata ||
					null

				// Optimistically add message to state (avoid duplicates)
				const newMessage = {
					id: messageId,
					conversation_id: conversationId,
					sender_id: user?.id,
					content: content,
					created_at: new Date().toISOString(),
					type: resolvedType,
					media_url: resolvedMediaUrl,
					media_metadata: resolvedMediaMetadata,
				}
				setMessages((prev) => {
					// Check if message already exists
					if (prev.some(m => m.id === messageId)) {
						console.log('[ChatContext] Message already exists, skipping:', messageId)
						return prev
					}
					return [...prev, newMessage]
				})

				// Optimistically update conversation with last message info
				const lastMessageAt = new Date().toISOString()
				setConversations((prev) =>
					prev.map((conv) =>
						conv.id === conversationId
							? {
								...conv,
								last_message_content: content,
								last_message_at: lastMessageAt,
								last_message_sender_id: user?.id,
								last_message_type: resolvedType,
								last_message_media_url: resolvedMediaUrl,
							}
							: conv
					)
				)

				return response
			} catch (err) {
				console.error('Failed to send message:', err)
				setError(err.message || 'Failed to send message')
				throw err
			}
		},
		[user?.id, messages]
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
			if (!conversation) {
				console.warn('[ChatContext] selectConversation called with null/undefined conversation')
				return
			}

			// Preserve existing participant info when selecting
			const enrichedConv = conversation.recipient 
				? conversation 
				: (enrichConversations([conversation])[0] || conversation)
			
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
		async (
			recipientId,
			content,
			recipientInfo = null,
			messageOptions = {}
		) => {
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
				const result = await chatApi.startConversation(
					user.id,
					recipientId,
					content,
					messageOptions
				)
				
				// Normalize response - API returns messageId (camelCase)
				const messageId = result.messageId || result.message_id
				console.log('[ChatContext] startNewConversation result:', result, 'messageId:', messageId)
				const resolvedType =
					messageOptions?.type ||
					result.type ||
					chatApi.CHAT_MESSAGE_TYPES?.TEXT ||
					'MESSAGE_TYPE_TEXT'
				const resolvedMediaUrl =
					messageOptions?.mediaUrl ||
					result.mediaUrl ||
					result.media_url ||
					null
				const resolvedMediaMetadata =
					messageOptions?.mediaMetadata ||
					result.mediaMetadata ||
					result.media_metadata ||
					null

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
				const enrichedWithMedia = enriched.map((conv) =>
					conv.id === result.conversation_id
						? {
							...conv,
							last_message_type: conv.last_message_type || resolvedType,
							last_message_media_url:
								conv.last_message_media_url || resolvedMediaUrl,
						}
						: conv
				)
				setConversations(enrichedWithMedia)

				// Find the conversation with the returned ID
				let newConv = enrichedWithMedia.find(c => c.id === result.conversation_id)

				if (newConv) {
					if (!newConv.last_message_type && resolvedType) {
						newConv = { ...newConv, last_message_type: resolvedType }
					}
					if (!newConv.last_message_media_url && resolvedMediaUrl) {
						newConv = { ...newConv, last_message_media_url: resolvedMediaUrl }
					}
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

					// Set the first message (check for duplicates)
					const newMessage = {
						id: messageId,
						conversation_id: result.conversation_id,
						sender_id: user?.id,
						content: content,
						created_at: new Date().toISOString(),
						type: resolvedType,
						media_url: resolvedMediaUrl,
						media_metadata: resolvedMediaMetadata,
					}
					setMessages((prev) => {
						if (prev.some(m => m.id === messageId)) {
							return prev
						}
						// For new conversation, just set this message
						if (prev.length === 0 || prev[0]?.conversation_id !== result.conversation_id) {
							return [newMessage]
						}
						return [...prev, newMessage]
					})

					return result
				}

				// If conversation not found in list, create a minimal version
				const minimalConv = {
					id: result.conversation_id,
					last_message_content: content,
					last_message_at: new Date().toISOString(),
					last_message_type: resolvedType,
					last_message_media_url: resolvedMediaUrl,
					unread_count: 0,
					recipient: recipientInfo || activeConversation?.recipient,
					participants: [
						{ id: user.id, full_name: user.full_name, username: user.username },
						recipientInfo || activeConversation?.recipient
					]
				}
				setActiveConversationState(minimalConv)
				
				const newMessage2 = {
					id: messageId,
					conversation_id: result.conversation_id,
					sender_id: user?.id,
					content: content,
					created_at: new Date().toISOString(),
					type: resolvedType,
					media_url: resolvedMediaUrl,
					media_metadata: resolvedMediaMetadata,
				}
				setMessages((prev) => {
					if (prev.some(m => m.id === messageId)) {
						return prev
					}
					return [newMessage2]
				})

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
								type:
									data.type ||
									chatApi.CHAT_MESSAGE_TYPES?.TEXT ||
									'MESSAGE_TYPE_TEXT',
								media_url: data.media_url || null,
								media_metadata: data.media_metadata || null,
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

	// Auto-refresh conversations every 15 seconds (polling for new messages when WS is not available)
	useEffect(() => {
		if (!authed || !user?.id) return

		// Only poll if WebSocket is not connected
		if (wsConnected) return

		const pollInterval = setInterval(() => {
			console.log('[ChatContext] Polling for new conversations...')
			loadConversations()
		}, 5000) // Poll every 5 seconds

		return () => clearInterval(pollInterval)
	}, [authed, user?.id, wsConnected, loadConversations])

	// Auto-refresh messages for active conversation (polling when WS not available)
	useEffect(() => {
		if (!authed || !user?.id || !activeConversation?.id || wsConnected) return

		const pollMessages = setInterval(() => {
			console.log('[ChatContext] Polling for new messages in conversation:', activeConversation.id)
			loadMessages(activeConversation.id)
		}, 3000) // Poll every 3 seconds for active conversation

		return () => clearInterval(pollMessages)
	}, [authed, user?.id, activeConversation?.id, wsConnected, loadMessages])

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
		getConversationUnread,

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
