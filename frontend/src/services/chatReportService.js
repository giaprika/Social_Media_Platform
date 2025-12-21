import { appendCustomOffensiveWords } from 'src/utils/contentFilter'

const REPORT_LOG_KEY = 'chat_report_logs'
const REPORT_COUNT_KEY = 'chat_report_word_counts'
const REPORT_THRESHOLD = 3

const isBrowser =
	typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const readStorage = (key, fallback) => {
	if (!isBrowser) return fallback
	try {
		const raw = window.localStorage.getItem(key)
		if (!raw) return fallback
		const parsed = JSON.parse(raw)
		return parsed ?? fallback
	} catch (error) {
		console.warn('[ChatReportService] Failed to parse storage key', key, error)
		return fallback
	}
}

const writeStorage = (key, value) => {
	if (!isBrowser) return
	try {
		window.localStorage.setItem(key, JSON.stringify(value))
	} catch (error) {
		console.warn('[ChatReportService] Failed to write storage key', key, error)
	}
}

const tokenize = (text = '') => {
	return text
		.toLowerCase()
		.split(
			/[^a-z0-9àáảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]+/i
		)
		.map((token) => token.trim())
		.filter((token) => token.length > 0)
}

const sanitizeTokens = (tokens = [], fallbackText = '') => {
	const normalized = []
	const seen = new Set()

	tokens.forEach((token) => {
		if (typeof token !== 'string') return
		const cleaned = token.trim().toLowerCase()
		if (!cleaned || seen.has(cleaned)) return
		seen.add(cleaned)
		normalized.push(cleaned)
	})

	if (normalized.length > 0) {
		return normalized
	}

	const fallbackTokens = tokenize(fallbackText)
	fallbackTokens.forEach((token) => {
		if (!seen.has(token)) {
			seen.add(token)
			normalized.push(token)
		}
	})

	return normalized
}

const appendLogEntry = (entry) => {
	const logs = readStorage(REPORT_LOG_KEY, [])
	logs.push(entry)
	writeStorage(REPORT_LOG_KEY, logs)
}

const updateWordCounts = async (tokens) => {
	const counts = readStorage(REPORT_COUNT_KEY, {})
	const promoted = []

	tokens.forEach((token) => {
		const nextValue = (counts[token] || 0) + 1
		counts[token] = nextValue
		if (nextValue >= REPORT_THRESHOLD) {
			promoted.push(token)
			delete counts[token]
		}
	})

	writeStorage(REPORT_COUNT_KEY, counts)

	if (promoted.length > 0) {
		await appendCustomOffensiveWords(promoted)
	}

	return { countsSnapshot: counts, promoted }
}

export const reportMessageTokens = async ({
	reporterId,
	messageId,
	conversationId,
	tokens = [],
	excerpt = '',
}) => {
	if (!isBrowser) {
		throw new Error('Trình duyệt đang chạy ở chế độ không hỗ trợ localStorage')
	}
	if (!reporterId) {
		throw new Error('Bạn cần đăng nhập để report tin nhắn')
	}
	if (!messageId) {
		throw new Error('Thiếu thông tin tin nhắn để report')
	}

	const normalizedTokens = sanitizeTokens(tokens, excerpt)
	if (normalizedTokens.length === 0) {
		throw new Error('Hãy chọn hoặc nhập phần nội dung muốn report')
	}

	const entry = {
		id: `${messageId}_${Date.now()}`,
		reporterId,
		messageId,
		conversationId,
		excerpt: excerpt?.trim() || '',
		tokens: normalizedTokens,
		timestamp: new Date().toISOString(),
	}

	appendLogEntry(entry)

	const { promoted } = await updateWordCounts(normalizedTokens)

	return {
		tokens: normalizedTokens,
		addedWords: promoted,
	}
}

const formatLogLines = (logs) => {
	if (!logs.length) {
		return 'Chưa có báo cáo nào.'
	}
	return logs
		.map((entry) => {
			const segment = entry.excerpt ? ` | trích dẫn: ${entry.excerpt}` : ''
			return `[${entry.timestamp}] convo:${entry.conversationId || 'n/a'} msg:${
				entry.messageId
			} người báo cáo:${entry.reporterId} | các từ: ${entry.tokens.join(
				', '
			)}${segment}`
		})
		.join('\n')
}

const formatCounts = (counts) => {
	const entries = Object.entries(counts || {})
	if (!entries.length) {
		return 'Không có từ chờ duyệt.'
	}
	return entries.map(([word, count]) => `${word}=${count}`).join('\n')
}

const triggerDownload = (filename, content) => {
	const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

export const downloadReportFiles = () => {
	if (!isBrowser) {
		throw new Error('Chức năng export chỉ dùng được trên trình duyệt')
	}
	const logs = readStorage(REPORT_LOG_KEY, [])
	const counts = readStorage(REPORT_COUNT_KEY, {})
	triggerDownload('reported_messages.txt', formatLogLines(logs))
	triggerDownload('reported_word_counts.txt', formatCounts(counts))
}

export const getPendingWordCounts = () => {
	const counts = readStorage(REPORT_COUNT_KEY, {})
	return counts
}
