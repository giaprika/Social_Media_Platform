import axios from 'axios'
import logger from '../../utils/logger.js'
import moderateContent from '../ai/aiService.js'

/**
 * Chat Moderation Service
 * Kiểm tra nội dung media (ảnh/video) trong chat bằng AI
 */

/**
 * Moderate chat media content
 * @param {string} mediaUrl - URL của media đã upload lên Cloudinary
 * @param {string} mediaType - Loại media: 'IMAGE', 'VIDEO', 'FILE'
 * @param {string} userId - ID của user gửi tin nhắn
 * @returns {Promise<{isViolation: boolean, result: string, message: string}>}
 */
export async function moderateChatMedia(mediaUrl, mediaType, userId) {
    // Skip nếu không có URL hoặc là text/file
    if (!mediaUrl || mediaType === 'MESSAGE_TYPE_TEXT' || mediaType === 'MESSAGE_TYPE_FILE') {
        return { isViolation: false, result: 'Accepted', message: 'No media to moderate' }
    }

    try {
        logger.info('[Chat Moderation] Starting media moderation', {
            userId,
            mediaType,
            mediaUrl: mediaUrl.substring(0, 100) + '...',
        })

        // Fetch media từ URL và convert sang base64
        const response = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
        })

        const buffer = Buffer.from(response.data)
        const base64Data = buffer.toString('base64')

        // Determine MIME type from media type
        let mimeType = 'image/jpeg' // default
        if (mediaType === 'MESSAGE_TYPE_VIDEO') {
            mimeType = 'video/mp4'
        } else if (mediaUrl.includes('.png')) {
            mimeType = 'image/png'
        } else if (mediaUrl.includes('.gif')) {
            mimeType = 'image/gif'
        } else if (mediaUrl.includes('.webp')) {
            mimeType = 'image/webp'
        }

        // Tạo message theo format của AI service
        const newMessage = {
            role: 'user',
            parts: [
                {
                    inlineData: {
                        displayName: 'chat_media',
                        data: base64Data,
                        mimeType: mimeType,
                    },
                },
            ],
        }

        // Gọi AI moderation
        const res = await moderateContent({
            userId: userId,
            newMessage: newMessage,
        })

        if (!res.ok) {
            logger.error('[Chat Moderation] AI moderation failed', {
                error: res.error,
                status: res.status,
            })
            // Nếu AI fail, cho phép content (fail-open)
            return { isViolation: false, result: 'Accepted', message: 'AI service unavailable' }
        }

        // Parse response từ AI
        const aiResponse = res.data
        let moderationResult = { result: 'Accepted', message: '' }

        try {
            if (aiResponse.parts && aiResponse.parts.length > 0) {
                let textContent = aiResponse.parts[0].text

                // Remove markdown code block wrapper
                textContent = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

                // Parse JSON
                const parsed = JSON.parse(textContent)

                moderationResult = {
                    result: parsed.result?.trim() || 'Accepted',
                    message: parsed.message || '',
                }

                logger.info('[Chat Moderation] AI Moderation result', {
                    userId,
                    result: moderationResult.result,
                    message: moderationResult.message,
                })
            }
        } catch (parseError) {
            logger.warn('[Chat Moderation] Failed to parse AI response, allowing content', {
                error: parseError.message,
            })
        }

        // Determine if this is a violation
        const isViolation = moderationResult.result !== 'Accepted'

        return {
            isViolation,
            result: moderationResult.result,
            message: moderationResult.message,
        }
    } catch (error) {
        logger.error('[Chat Moderation] Error moderating media', {
            error: error.message,
            userId,
            mediaUrl: mediaUrl.substring(0, 100),
        })

        // Fail-open: nếu có lỗi, cho phép content
        return { isViolation: false, result: 'Accepted', message: 'Moderation error, content allowed' }
    }
}

export default { moderateChatMedia }
