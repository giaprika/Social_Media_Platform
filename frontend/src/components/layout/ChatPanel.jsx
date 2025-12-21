import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ArrowTopRightOnSquareIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EnvelopeOpenIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  PlusCircleIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useChat } from 'src/contexts/ChatContext'
import useAuth from 'src/hooks/useAuth'
import { formatDistanceToNow } from 'date-fns'
import * as userApi from 'src/api/user'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import Avatar from 'src/components/ui/Avatar'
import { filterOffensiveContent } from 'src/utils/contentFilter'
import { CHAT_MESSAGE_TYPES } from 'src/api/chat'
import {
  requestChatUploadCredentials,
  uploadImageToCloudinary,
  validateImageFile,
} from 'src/services/chatMediaUpload'

const filterOptions = [
  { id: 'channels', label: 'Chat channels' },
  { id: 'groups', label: 'Group chats' },
  { id: 'direct', label: 'Direct chats' },
  { id: 'modmail', label: 'Mod mail' },
]

const MEDIA_PREVIEW_LABELS = {
  [CHAT_MESSAGE_TYPES?.IMAGE ?? 'MESSAGE_TYPE_IMAGE']: 'Photo',
  [CHAT_MESSAGE_TYPES?.VIDEO ?? 'MESSAGE_TYPE_VIDEO']: 'Video',
  [CHAT_MESSAGE_TYPES?.FILE ?? 'MESSAGE_TYPE_FILE']: 'Attachment',
}

const getMediaPreviewLabel = (type, hasMedia = false) => {
  if (type && MEDIA_PREVIEW_LABELS[type]) {
    return MEDIA_PREVIEW_LABELS[type]
  }
  if (hasMedia) {
    return 'Attachment'
  }
  return ''
}

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size % 1 === 0 ? size : size.toFixed(1)} ${units[unitIndex]}`
}

// Conversation List Item Component
const ConversationItem = ({ conversation, isActive, onClick, currentUserId, unreadCount = 0 }) => {
  // Support both camelCase (from API) and snake_case (normalized)
  const lastMessageAt = conversation.last_message_at || conversation.lastMessageAt
  const lastMessageContent = conversation.last_message_content || conversation.lastMessageContent
  const lastMessageSenderId = conversation.last_message_sender_id || conversation.lastMessageSenderId
  const lastMessageType = conversation.last_message_type || conversation.lastMessageType
  const lastMessageMediaUrl = conversation.last_message_media_url || conversation.lastMessageMediaUrl
  const timeAgo = lastMessageAt
    ? formatDistanceToNow(new Date(lastMessageAt), {
      addSuffix: true,
    })
    : ''

  // Get the other participant (not the current user) for direct chats
  const otherParticipant = conversation.participants?.find(
    (p) => p.id !== currentUserId
  )

  const conversationName =
    conversation.recipient?.full_name ||
    otherParticipant?.full_name ||
    conversation.name ||
    'Chat'

  const avatarUrl = conversation.recipient?.avatar_url || otherParticipant?.avatar_url
  const isDirectChat = conversation.participants?.length === 2 || conversation.recipient

  // Check if last message was sent by current user
  const isLastMessageOwn = lastMessageSenderId &&
    String(lastMessageSenderId).toLowerCase() === String(currentUserId).toLowerCase()

  const mediaPreviewLabel = getMediaPreviewLabel(lastMessageType, Boolean(lastMessageMediaUrl))
  const initialPreview = lastMessageContent
    ? (isLastMessageOwn ? `You: ${lastMessageContent}` : lastMessageContent)
    : mediaPreviewLabel
      ? (isLastMessageOwn ? `You: ${mediaPreviewLabel}` : mediaPreviewLabel)
      : 'No messages yet'

  // Only show unread count for incoming messages (not messages we sent)
  const displayUnread = Number.isFinite(unreadCount) ? unreadCount : 0
  const showUnreadBadge = displayUnread > 0 && !isLastMessageOwn && !isActive

  // Filter offensive content from message preview
  const [filteredPreview, setFilteredPreview] = useState(initialPreview)

  useEffect(() => {
    const filterPreview = async () => {
      if (!lastMessageContent?.trim() && mediaPreviewLabel) {
        setFilteredPreview(isLastMessageOwn ? `You: ${mediaPreviewLabel}` : mediaPreviewLabel)
        return
      }

      if (lastMessageContent) {
        const filtered = await filterOffensiveContent(lastMessageContent)
        setFilteredPreview(isLastMessageOwn ? `You: ${filtered}` : filtered)
      } else {
        setFilteredPreview(mediaPreviewLabel || 'No messages yet')
      }
    }
    filterPreview()
  }, [lastMessageContent, isLastMessageOwn, mediaPreviewLabel])

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full flex items-start gap-3 p-3 text-left transition-colors',
        isActive
          ? 'bg-primary/10 border-l-2 border-primary'
          : 'hover:bg-muted/50'
      )}
    >
      {isDirectChat ? (
        <Avatar
          src={avatarUrl}
          name={conversationName}
          size="md"
          className="flex-shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <UserGroupIcon className="h-5 w-5 text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground truncate">
            {conversationName}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {filteredPreview}
        </p>
      </div>
      {showUnreadBadge && (
        <span className="flex-shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
          {displayUnread}
        </span>
      )}
    </button>
  )
}

// Message Component
const MessageItem = ({ message, isOwn, senderName }) => {
  // Support both camelCase (from API) and snake_case (legacy)
  const createdAt = message.createdAt || message.created_at
  const timeAgo = createdAt
    ? formatDistanceToNow(new Date(createdAt), { addSuffix: true })
    : ''
  const mediaUrl = message.media_url || message.mediaUrl

  // Filter offensive content from message
  const [filteredContent, setFilteredContent] = useState(message.content)

  useEffect(() => {
    const filterContent = async () => {
      if (message.content) {
        const filtered = await filterOffensiveContent(message.content)
        setFilteredContent(filtered)
      }
    }
    filterContent()
  }, [message.content])

  const hasText = Boolean(filteredContent && filteredContent.trim().length > 0)
  const showSenderLabel = !isOwn && senderName

  return (
    <div
      className={clsx('flex mb-2 group', isOwn ? 'justify-end' : 'justify-start')}
    >
      <div className={clsx('flex items-end gap-2', isOwn ? 'flex-row-reverse' : 'flex-row')}>
        <div className={clsx('max-w-[70%] flex flex-col gap-2', isOwn ? 'items-end' : 'items-start')}>
          {/* Show sender name for received messages in group chats */}
          {showSenderLabel && (
            <span className="text-xs text-muted-foreground mb-1 block px-2">
              {senderName}
            </span>
          )}

          {mediaUrl && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-2xl border border-border bg-background"
            >
              <img
                src={mediaUrl}
                alt={hasText ? 'Chat attachment' : 'Photo attachment'}
                className="max-h-64 w-full object-cover"
                loading="lazy"
              />
            </a>
          )}

          {hasText && (
            <div
              className={clsx(
                'rounded-2xl px-4 py-2 inline-block text-left',
                isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              <p className="text-sm break-words">{filteredContent}</p>
            </div>
          )}
        </div>
        {/* Time - only visible on hover */}
        <span
          className={clsx(
            'text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap',
          )}
        >
          {timeAgo}
        </span>
      </div>
    </div>
  )
}

// Chat View Component (when a conversation is selected)
const ChatView = ({ conversation }) => {
  const {
    messages,
    sendMessage,
    startNewConversation,
    setActiveConversation,
    isLoading,
    loadMessages,
  } = useChat()
  const { user: authUser } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [uploadStatus, setUploadStatus] = useState('idle')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const currentUserId = authUser?.id

  const resetAttachment = useCallback(() => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    setSelectedImage(null)
    setImagePreviewUrl('')
    setAttachmentError('')
    setUploadStatus('idle')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [imagePreviewUrl])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl)
      }
    }
  }, [imagePreviewUrl])

  useEffect(() => {
    resetAttachment()
  }, [conversation?.id, resetAttachment])

  // Get the other participant for direct chats
  const otherParticipant = conversation.participants?.find(
    (p) => p.id !== currentUserId
  )

  // Get sender name for a message
  const getSenderName = (msgSenderId) => {
    if (!msgSenderId) return 'Unknown'
    const senderId = String(msgSenderId).toLowerCase()
    if (senderId === String(currentUserId).toLowerCase()) return 'You'
    if (String(conversation.recipient?.id).toLowerCase() === senderId) {
      return conversation.recipient.full_name || conversation.recipient.username
    }
    const participant = conversation.participants?.find(
      (p) => String(p.id).toLowerCase() === senderId
    )
    return participant?.full_name || participant?.username || 'Unknown'
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when conversation changes
  useEffect(() => {
    inputRef.current?.focus()
  }, [conversation?.id])

  const handleAttachmentChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      validateImageFile(file)
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl)
      }
      setSelectedImage(file)
      setImagePreviewUrl(URL.createObjectURL(file))
      setAttachmentError('')
      setUploadStatus('idle')
    } catch (error) {
      setAttachmentError(error.message)
      event.target.value = ''
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    const rawValue = inputValue
    const content = rawValue.trim()
    const hasAttachment = Boolean(selectedImage)
    if ((!content && !hasAttachment) || isSending) return

    // Get recipient ID from various sources
    const recipientId = conversation.recipient?.id || otherParticipant?.id

    console.log('[ChatPanel] handleSend:', {
      content,
      isNew: conversation.isNew,
      conversationId: conversation.id,
      recipientId: recipientId,
      recipientSource: conversation.recipient?.id ? 'recipient' : otherParticipant?.id ? 'otherParticipant' : 'none',
      conversationData: conversation,
    })

    setIsSending(true)
    setInputValue('')
    setAttachmentError('')

    try {
      const messageOptions = {}

      if (selectedImage) {
        validateImageFile(selectedImage)
        setUploadStatus('credentials')
        const credentials = await requestChatUploadCredentials()
        setUploadStatus('uploading')
        const uploadResult = await uploadImageToCloudinary(selectedImage, credentials)
        setUploadStatus('ready')
        const mediaUrl = uploadResult.secure_url || uploadResult.url
        if (!mediaUrl) {
          throw new Error('Không nhận được URL ảnh sau khi tải lên')
        }
        messageOptions.type = CHAT_MESSAGE_TYPES?.IMAGE || 'MESSAGE_TYPE_IMAGE'
        messageOptions.mediaUrl = mediaUrl
        messageOptions.mediaMetadata = {
          width: uploadResult.width,
          height: uploadResult.height,
          bytes: uploadResult.bytes,
          format: uploadResult.format,
          resource_type: uploadResult.resource_type,
          original_filename: uploadResult.original_filename,
        }
      }

      if (conversation.isNew) {
        // New conversation -> use startNewConversation with recipient info
        console.log('[ChatPanel] Starting new conversation with recipient:', conversation.recipient)
        const result = await startNewConversation(
          conversation.recipient.id,
          content,
          conversation.recipient, // Pass recipient info to cache
          messageOptions
        )
        console.log('[ChatPanel] New conversation result:', result)
      } else {
        // Existing conversation -> send message with recipient ID to ensure they're a participant
        console.log('[ChatPanel] Sending to existing conversation:', conversation.id, 'recipient:', recipientId)
        await sendMessage(conversation.id, content, recipientId, messageOptions)
      }

      if (selectedImage) {
        resetAttachment()
      }
    } catch (error) {
      console.error('[ChatPanel] Failed to send message:', error)
      setInputValue(rawValue) // Restore input on error
      setAttachmentError(error.message || 'Failed to send message')
    } finally {
      setIsSending(false)
      setUploadStatus('idle')
    }
  }

  const handleLoadMore = () => {
    if (messages.length > 0 && !isLoading && conversation.id) {
      const oldestMessage = messages[0]
      loadMessages(conversation.id, {
        beforeTimestamp: oldestMessage.created_at,
      })
    }
  }

  // Determine conversation display info
  const conversationName =
    conversation.recipient?.full_name ||
    otherParticipant?.full_name ||
    conversation.name ||
    'Chat'

  const avatarUrl = conversation.recipient?.avatar_url || otherParticipant?.avatar_url
  const username = conversation.recipient?.username || otherParticipant?.username
  const isDirectChat = conversation.participants?.length === 2 || conversation.recipient

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        {isDirectChat ? (
          <Avatar
            src={avatarUrl}
            name={conversationName}
            size="sm"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <UserGroupIcon className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate block">
            {conversationName}
          </span>
          {username && (
            <span className="text-xs text-muted-foreground truncate block">
              @{username}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length > 0 && (
          <div className="flex justify-center mb-3">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoading}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <ChatBubbleOvalLeftEllipsisIcon className="h-12 w-12 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground/70">
              Start the conversation with {conversationName}!
            </p>
          </div>
        )}

        {messages.map((message) => {
          // Support both camelCase (from API) and snake_case (legacy)
          const senderId = message.senderId || message.sender_id
          const isOwn = currentUserId && senderId &&
            String(senderId).toLowerCase() === String(currentUserId).toLowerCase()

          // Debug log
          if (messages.indexOf(message) === 0) {
            console.log('[ChatPanel] Message comparison:', {
              senderId,
              currentUserId,
              isOwn,
              messageKeys: Object.keys(message),
            })
          }

          return (
            <MessageItem
              key={message.id}
              message={message}
              isOwn={isOwn}
              senderName={!isDirectChat ? getSenderName(senderId) : null}
            />
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input & Attachments */}
      <div className="border-t border-border p-3">
        {selectedImage && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-2.5">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-border">
              <img
                src={imagePreviewUrl}
                alt="Selected attachment preview"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 text-xs">
              <p className="font-medium text-foreground truncate">{selectedImage.name}</p>
              <p className="text-muted-foreground">{formatFileSize(selectedImage.size)}</p>
              {uploadStatus !== 'idle' && (
                <p className="text-[11px] text-primary mt-0.5">
                  {uploadStatus === 'credentials'
                    ? 'Requesting upload token...'
                    : uploadStatus === 'uploading'
                      ? 'Uploading photo...'
                      : 'Upload ready'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={resetAttachment}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Remove image"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {attachmentError && (
          <p className="mb-2 text-xs text-destructive">{attachmentError}</p>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAttachmentChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none disabled:opacity-50"
            aria-label="Add image"
            disabled={isSending}
          >
            <PhotoIcon className="h-5 w-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            disabled={isSending}
            className="flex-1 rounded-full bg-muted px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={(!inputValue.trim() && !selectedImage) || isSending}
            className="rounded-full bg-primary p-2 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

// Empty State Component
const EmptyState = ({ isExpanded, onStartChat }) => (
  <section
    className={clsx(
      'flex flex-col items-center justify-center gap-3 bg-muted/20 text-center',
      isExpanded ? 'py-8 h-full' : 'py-10'
    )}
  >
    <div
      className={clsx(
        'flex items-center justify-center rounded-full bg-primary/10',
        isExpanded ? 'h-20 w-20' : 'h-16 w-16'
      )}
    >
      <ChatBubbleOvalLeftEllipsisIcon
        className={clsx('text-primary', isExpanded ? 'h-10 w-10' : 'h-8 w-8')}
      />
    </div>
    <div className="px-4">
      <h3
        className={clsx(
          'font-semibold text-foreground',
          isExpanded ? 'text-lg' : 'text-base'
        )}
      >
        Welcome to chat!
      </h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">
        Start a direct or group chat with other users.
      </p>
    </div>
    <button
      type="button"
      onClick={onStartChat}
      className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
    >
      <PlusCircleIcon className="h-4 w-4" />
      Start new chat
    </button>
  </section>
)

// Conversation List Component
const ConversationList = ({ conversations, activeId, onSelect, isLoading, currentUserId, getUnreadCount }) => {
  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-3">
        <p className="text-xs text-muted-foreground">No conversations yet</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          They'll show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          isActive={activeId === conversation.id}
          onClick={() => onSelect(conversation)}
          currentUserId={currentUserId}
          unreadCount={getUnreadCount ? getUnreadCount(conversation) : conversation.unread_count}
        />
      ))}
    </div>
  )
}



// User Search Modal Component
const UserSearchModal = ({ isOpen, onClose, onSelectUser }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const searchTimeoutRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setResults([])
    }
  }, [isOpen])

  const handleSearch = async (value) => {
    setQuery(value)
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!value.trim()) {
      setResults([])
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const response = await userApi.searchUsers(value)
        setResults(response.data || [])
      } catch (error) {
        console.error('Failed to search users:', error)
      } finally {
        setIsLoading(false)
      }
    }, 500)
  }

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-card p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">New Chat</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted text-muted-foreground"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mb-4">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full rounded-lg border border-border bg-muted py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : results.length > 0 ? (
            results.map((user) => (
              <button
                key={user.id}
                onClick={() => onSelectUser(user)}
                className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-muted text-left"
              >
                <Avatar
                  src={user.avatar_url}
                  name={user.full_name}
                  size="md"
                />
                <div>
                  <p className="font-medium text-foreground">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    @{user.username}
                  </p>
                </div>
              </button>
            ))
          ) : query ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No users found
            </p>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-4">
              Type to search for people
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const ChatPanel = ({ isOpen, onClose }) => {
  const panelRef = useRef(null)
  const dropdownRef = useRef(null)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState(
    () => new Set(filterOptions.map((option) => option.id))
  )
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // Auth
  const { user: authUser } = useAuth()

  // Chat Context
  const {
    conversations,
    activeConversation,
    setActiveConversation,
    isLoading,
    unreadCount,
    startNewConversation,
    getConversationUnread,
  } = useChat()

  const filtersSummary = useMemo(() => {
    if (selectedFilters.size === filterOptions.length && !showUnreadOnly) {
      return 'All conversations'
    }

    const enabled = filterOptions
      .filter((option) => selectedFilters.has(option.id))
      .map((option) => option.label)

    const summary = enabled.length ? enabled.join(', ') : 'No filters'
    return showUnreadOnly ? `${summary} • Unread` : summary
  }, [selectedFilters, showUnreadOnly])

  const toggleFilter = (id) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const resetFilters = () => {
    setSelectedFilters(new Set(filterOptions.map((option) => option.id)))
    setShowUnreadOnly(false)
  }

  const handleClose = useCallback(() => {
    setIsFiltersOpen(false)
    setIsMinimized(false)
    setIsExpanded(false)
    setActiveConversation(null)
    setIsSearchOpen(false)
    onClose?.()
  }, [onClose, setActiveConversation])

  const handleStartChat = async (user) => {
    try {
      // Check if conversation already exists
      const existingConv = conversations.find((c) =>
        c.participants?.some((p) => p.id === user.id)
      )

      if (existingConv) {
        setActiveConversation(existingConv)
      } else {
        // Create optimistic conversation
        const tempConv = {
          id: null, // No ID yet
          isNew: true,
          recipient: user,
          participants: [user],
          unread_count: 0,
        }
        setActiveConversation(tempConv)
      }
      setIsSearchOpen(false)
    } catch (error) {
      console.error('Failed to start chat:', error)
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        if (isSearchOpen) {
          setIsSearchOpen(false)
        } else if (isFiltersOpen) {
          setIsFiltersOpen(false)
        } else {
          handleClose()
        }
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isFiltersOpen, isSearchOpen, handleClose])

  useEffect(() => {
    if (!isOpen) {
      setIsFiltersOpen(false)
      setIsMinimized(false)
      setIsSearchOpen(false)
    }
  }, [isOpen])

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const unreadValue = getConversationUnread ? getConversationUnread(conv) : conv.unread_count
      if (showUnreadOnly && (!unreadValue || unreadValue === 0)) return false
      // Add more filters here if needed based on conversation type
      return true
    })
  }, [conversations, showUnreadOnly, getConversationUnread])

  // Floating button when closed
  if (!isOpen) {
    return null
  }

  // Minimized state - just header bar
  if (isMinimized) {
    return (
      <div
        ref={panelRef}
        className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <header
          className="flex items-center justify-between bg-background px-4 py-2.5 cursor-pointer"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center gap-2">
            <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Chats</span>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimized(false)
              }}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Expand"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleClose()
              }}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className={clsx(
        'fixed z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200',
        isExpanded
          ? 'bottom-4 right-4 left-4 top-20 sm:left-auto sm:w-[800px] sm:top-auto sm:h-[600px]'
          : 'bottom-4 right-4 w-[360px] sm:w-[400px] h-[600px] max-h-[calc(100vh-2rem)]'
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold text-foreground">Chats</span>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 text-muted-foreground">
          <button
            type="button"
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Mark all as read"
            title="Mark all as read"
          >
            <EnvelopeOpenIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="New chat"
            title="New chat"
          >
            <PlusCircleIcon className="h-4 w-4" />
          </button>
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsFiltersOpen((prev) => !prev)}
              className={clsx(
                'flex items-center rounded-full p-1.5 transition-colors',
                isFiltersOpen
                  ? 'bg-primary/15 text-primary'
                  : 'hover:bg-muted hover:text-foreground'
              )}
              aria-label="Filter"
              title="Filter chats"
            >
              <UserGroupIcon className="h-4 w-4" />
              <ChevronDownIcon className="h-3 w-3" />
            </button>

            {isFiltersOpen && (
              <div className="absolute right-0 top-9 w-56 rounded-xl border border-border bg-card p-3 shadow-lg z-10">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Threads
                  </span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Reset
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-foreground">
                  {filterOptions.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFilters.has(option.id)}
                        onChange={() => toggleFilter(option.id)}
                        className="h-3.5 w-3.5 rounded border-border bg-card text-primary focus:ring-primary"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>

                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                    <span
                      className={clsx(
                        'relative inline-flex h-4 w-8 items-center rounded-full transition-colors',
                        showUnreadOnly ? 'bg-primary' : 'bg-muted'
                      )}
                    >
                      <span
                        className={clsx(
                          'absolute left-0.5 h-3 w-3 rounded-full bg-card shadow transition-transform',
                          showUnreadOnly ? 'translate-x-4' : 'translate-x-0'
                        )}
                      />
                    </span>
                    Unread
                    <input
                      type="checkbox"
                      checked={showUnreadOnly}
                      onChange={() => setShowUnreadOnly((prev) => !prev)}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(false)}
                    className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open in new window"
            title="Open in new window"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ArrowsPointingInIcon className="h-4 w-4" />
            ) : (
              <ArrowsPointingOutIcon className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="rounded-full p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Minimize"
            title="Minimize"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Close"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      {/* Content */}
      <div className="grid h-[calc(100%-45px)] grid-cols-[280px_1fr]">
        {/* Sidebar / List View */}
        <div className="flex flex-col h-full overflow-hidden bg-background border-r border-border">
          {/* Search/Filter Bar could go here */}

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            <ConversationList
              conversations={filteredConversations}
              activeId={activeConversation?.id}
              onSelect={setActiveConversation}
              isLoading={isLoading}
              currentUserId={authUser?.id}
              getUnreadCount={getConversationUnread}
            />
          </div>
        </div>

        {/* Chat View */}
        <div className="flex flex-col h-full overflow-hidden bg-background">
          {activeConversation ? (
            <ChatView conversation={activeConversation} />
          ) : (
            <EmptyState
              isExpanded={true}
              onStartChat={() => setIsSearchOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Search Modal */}
      <UserSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectUser={handleStartChat}
      />
    </div>
  )
}

export default ChatPanel;
