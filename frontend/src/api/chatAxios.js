import axios from 'axios'
import Cookies from 'universal-cookie'

const cookies = new Cookies()

// Chat Service - Direct connection to remote chat service
const CHAT_API_BASE = 'http://34.143.185.208:8080'

const chatApi = axios.create({
	baseURL: CHAT_API_BASE,
	timeout: 10000,
})

// UUID validation regex
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validate if a string is a valid UUID
 * @param {string} str - String to validate
 * @returns {boolean} True if valid UUID
 */
const isValidUUID = (str) => {
	if (!str || typeof str !== 'string') return false
	return UUID_REGEX.test(str)
}

// Request interceptor - add auth headers
chatApi.interceptors.request.use(
	(config) => {
		const accessToken = cookies.get('accessToken')
		const userId = cookies.get('x-user-id')

		if (accessToken) {
			config.headers.Authorization = `Bearer ${accessToken}`
		}

		// Validate userId is a proper UUID before sending
		if (userId && isValidUUID(userId)) {
			config.headers['x-user-id'] = userId
		} else {
			console.warn('[Chat Service] Invalid or missing x-user-id:', userId)
		}

		console.log('[Chat Service] Request:', {
			method: config.method,
			url: config.url,
			baseURL: config.baseURL,
			headers: {
				'x-user-id': config.headers['x-user-id'] || 'NOT SET',
				Authorization: accessToken ? 'Bearer ...' : undefined,
			},
			data: config.data,
		})

		return config
	},
	(error) => {
		return Promise.reject(error)
	}
)

// Response interceptor - handle errors
chatApi.interceptors.response.use(
	(response) => {
		console.log('[Chat Service] Response:', {
			status: response.status,
			data: response.data,
		})
		return response
	},
	(error) => {
		console.error('[Chat Service] Error:', {
			status: error.response?.status,
			data: error.response?.data,
			message: error.message,
		})
		return Promise.reject(error)
	}
)

export default chatApi
