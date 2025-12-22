import axios from 'axios'
import Cookies from 'universal-cookie'

const DEFAULT_LIVE_BASE_URL = 'https://api.extase.dev'
const LIVE_SERVICE_BASE_URL = (
	process.env.REACT_APP_LIVE_SERVICE_URL || DEFAULT_LIVE_BASE_URL
).replace(/\/$/, '')

const LOCAL_PROXY_PATH = '/live-api'
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0']

const resolveApiBaseUrl = () => {
	const forcedProxy = process.env.REACT_APP_LIVE_API_PROXY?.toLowerCase()
	if (forcedProxy === 'remote') {
		return LIVE_SERVICE_BASE_URL
	}
	if (forcedProxy === 'local') {
		return LOCAL_PROXY_PATH
	}
	if (typeof window !== 'undefined') {
		const { hostname } = window.location
		if (LOCAL_HOSTNAMES.includes(hostname)) {
			return LOCAL_PROXY_PATH
		}
	}
	return LIVE_SERVICE_BASE_URL
}

const liveInstance = axios.create({
	baseURL: resolveApiBaseUrl(),
	timeout: 15000,
})

liveInstance.interceptors.request.use((config) => {
	const cookies = new Cookies()
	const userId = cookies.get('x-user-id')
	const accessToken = cookies.get('accessToken')

	if (userId && !config.headers['X-User-ID']) {
		config.headers['X-User-ID'] = userId
	}

	if (accessToken && !config.headers.Authorization) {
		config.headers.Authorization = `Bearer ${accessToken}`
	}

	return config
})

export const getLiveFeed = (params = {}) =>
	liveInstance.get('/api/v1/live/feed', {
		params,
	})

export const getStreamDetail = (streamId) =>
	liveInstance.get(`/api/v1/live/${streamId}`)

export const getWebRTCInfo = (streamId) =>
	liveInstance.get(`/api/v1/live/${streamId}/webrtc`)

export const getViewerCount = (streamId) =>
	liveInstance.get(`/api/v1/live/${streamId}/viewers`)

export const createStream = (payload) =>
	liveInstance.post('/api/v1/live/create', payload)

export { LIVE_SERVICE_BASE_URL }
