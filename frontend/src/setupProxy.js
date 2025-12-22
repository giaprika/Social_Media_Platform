const { createProxyMiddleware } = require('http-proxy-middleware')

const DEFAULT_TARGET = 'https://api.extase.dev'
const target = (
	process.env.REACT_APP_LIVE_SERVICE_URL || DEFAULT_TARGET
).replace(/\/$/, '')

console.log('[live-proxy] Initializing proxy to:', target)

module.exports = function setupProxy(app) {
	const proxyMiddleware = createProxyMiddleware({
		target,
		changeOrigin: true,
		pathRewrite: { '^/live-api': '' },
		logLevel: 'debug',
		onProxyReq: (proxyReq, req) => {
			console.log(
				`[live-proxy] ${req.method} ${req.originalUrl} -> ${target}${proxyReq.path}`
			)
		},
		onError: (err, req, res) => {
			console.error('[live-proxy] ERROR:', err.message)
		},
	})

	app.use('/live-api', proxyMiddleware)
	console.log('[live-proxy] Mounted at /live-api')
}
