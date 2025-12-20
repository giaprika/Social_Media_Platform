import express from 'express'
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware'
import logger from '../../utils/logger.js'

const router = express.Router()

// Chat service URL
const CHAT_SERVICE_URL =
	process.env.CHAT_SERVICE_URL || 'http://34.158.60.36:8080'

// UUID validation regex
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isValidUUID = (str) => {
	if (!str || typeof str !== 'string') return false
	return UUID_REGEX.test(str)
}

// Create proxy middleware for chat service
const chatProxy = createProxyMiddleware({
	target: CHAT_SERVICE_URL,
	changeOrigin: true,
	pathRewrite: {
		'^/api/chat': '', // /api/chat/v1/messages -> /v1/messages
	},
	timeout: 30000,
	proxyTimeout: 30000,

	onProxyReq: (proxyReq, req, res) => {
		// Get user ID from auth middleware (req.user) or header
		let userId = req.user?.id || req.headers['x-user-id']

		// Validate UUID format
		if (userId && isValidUUID(userId)) {
			proxyReq.setHeader('x-user-id', userId)
		} else {
			logger.warn('[Chat Proxy] Invalid or missing x-user-id', {
				userId,
				path: req.originalUrl,
			})
		}

		// Forward authorization header
		if (req.headers.authorization) {
			proxyReq.setHeader('Authorization', req.headers.authorization)
		}

		// Fix body if it was already parsed
		fixRequestBody(proxyReq, req)

		logger.info('[Chat Proxy] Forwarding request', {
			method: req.method,
			originalUrl: req.originalUrl,
			target: CHAT_SERVICE_URL,
			userId: userId,
			hasValidUserId: isValidUUID(userId),
			body: req.body,
		})
	},

	onProxyRes: (proxyRes, req, res) => {
		logger.info('[Chat Proxy] Response', {
			status: proxyRes.statusCode,
			path: req.originalUrl,
		})
	},

	onError: (err, req, res) => {
		logger.error('[Chat Proxy] Error', {
			error: err.message,
			code: err.code,
			path: req.originalUrl,
		})

		if (!res.headersSent) {
			res.status(502).json({
				error: 'Chat Service Unavailable',
				message: 'Unable to connect to chat service',
				details: err.message,
			})
		}
	},
})

// Apply proxy to all routes
router.use('/', chatProxy)

export default router
