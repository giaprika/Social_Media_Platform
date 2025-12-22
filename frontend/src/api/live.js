import axios from 'axios'
import Cookies from 'universal-cookie'

const DEFAULT_LIVE_BASE_URL = 'https://api.extase.dev'
const LIVE_BASE_URL = (
	process.env.REACT_APP_LIVE_SERVICE_URL || DEFAULT_LIVE_BASE_URL
).replace(/\/$/, '')

const liveInstance = axios.create({
	baseURL: LIVE_BASE_URL,
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

export { LIVE_BASE_URL as LIVE_SERVICE_BASE_URL }
