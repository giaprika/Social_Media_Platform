const { createProxyMiddleware } = require('http-proxy-middleware')

const DEFAULT_TARGET = 'https://api.extase.dev'
const target = (
	process.env.REACT_APP_LIVE_SERVICE_URL || DEFAULT_TARGET
).replace(/\/$/, '')

module.exports = function setupProxy(app) {
	app.use(
		'/live-api',
		createProxyMiddleware({
			target,
			changeOrigin: true,
			pathRewrite: (path) => path.replace(/^\/live-api/, ''),
			logLevel: 'warn',
		})
	)
}
