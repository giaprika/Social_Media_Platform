import {
	appendCustomOffensiveWords,
	getCustomOffensiveWords,
} from 'src/utils/contentFilter'

const REPORT_THRESHOLD = 3
const REPORT_LOG_FILENAME = 'reported_messages.txt'
const REPORT_COUNT_FILENAME = 'reported_word_counts.txt'
const OFFENSIVE_WORDS_FILENAME = 'offensive_words.txt'

const isBrowser =
	typeof window !== 'undefined' && typeof document !== 'undefined'

let reportEntries = []
let wordCounts = {}
let baseOffensiveWordsCache = null

const loadBaseOffensiveWords = async () => {
	if (baseOffensiveWordsCache) return baseOffensiveWordsCache
	try {
		const response = await fetch('/offensive_words.txt')
		const text = await response.text()
		baseOffensiveWordsCache = text
			.split('\n')
			.map((line) => line.trim().toLowerCase())
			.filter((line) => line.length > 0)
		return baseOffensiveWordsCache
	} catch (error) {
		console.warn('[ChatReportService] Cannot load offensive_words.txt', error)
		baseOffensiveWordsCache = []
		return baseOffensiveWordsCache
	}
}

const sanitizeTokens = (tokens = []) => {
	const normalized = []
	const seen = new Set()

	tokens.forEach((token) => {
		if (typeof token !== 'string') return
		const cleaned = token.trim().toLowerCase()
		if (!cleaned || seen.has(cleaned)) return
		seen.add(cleaned)
		normalized.push(cleaned)
	})

	return normalized
}

const appendLogEntry = (entry) => {
	reportEntries.push(entry)
}

const triggerDownload = (filename, content) => {
	if (!isBrowser) return
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

const mergeOffensiveWordList = async () => {
	const baseList = await loadBaseOffensiveWords()
	const customExtras = getCustomOffensiveWords()
	const merged = new Set([...baseList, ...customExtras])
	return Array.from(merged)
		.filter((word) => word.length > 0)
		.sort()
}

const downloadOffensiveWordsFile = async () => {
	const content = (await mergeOffensiveWordList()).join('\n')
	if (!content.length) return
	triggerDownload(OFFENSIVE_WORDS_FILENAME, content)
	baseOffensiveWordsCache = content
		.split('\n')
		.map((line) => line.trim().toLowerCase())
		.filter((line) => line.length > 0)
}

const updateWordCounts = async (tokens) => {
	const promoted = []

	tokens.forEach((token) => {
		const nextValue = (wordCounts[token] || 0) + 1
		wordCounts[token] = nextValue
		if (nextValue >= REPORT_THRESHOLD) {
			promoted.push(token)
			delete wordCounts[token]
		}
	})

	if (promoted.length > 0) {
		await appendCustomOffensiveWords(promoted)
		await downloadOffensiveWordsFile()
	}

	return { promoted }
}

const formatLogLines = () => {
	if (!reportEntries.length) {
		return 'Chưa có báo cáo nào.'
	}
	return reportEntries
		.map((entry) => {
			return `[${entry.timestamp}] convo:${entry.conversationId || 'n/a'} msg:${
				entry.messageId
			} người báo cáo:${entry.reporterId} | các từ: ${entry.tokens.join(', ')}`
		})
		.join('\n')
}

const formatCounts = () => {
	const entries = Object.entries(wordCounts || {})
	if (!entries.length) {
		return 'Không có từ chờ duyệt.'
	}
	return entries.map(([word, count]) => `${word}=${count}`).join('\n')
}

const persistReportFiles = () => {
	if (!isBrowser) return
	triggerDownload(REPORT_LOG_FILENAME, formatLogLines())
	triggerDownload(REPORT_COUNT_FILENAME, formatCounts())
}

export const reportMessageTokens = async ({
	reporterId,
	messageId,
	conversationId,
	tokens = [],
}) => {
	if (!isBrowser) {
		throw new Error('Trình duyệt hiện không hỗ trợ thao tác file báo cáo')
	}
	if (!reporterId) {
		throw new Error('Bạn cần đăng nhập để report tin nhắn')
	}
	if (!messageId) {
		throw new Error('Thiếu thông tin tin nhắn để report')
	}

	const normalizedTokens = sanitizeTokens(tokens)
	if (normalizedTokens.length === 0) {
		throw new Error('Hãy chọn ít nhất một từ để report')
	}

	const entry = {
		id: `${messageId}_${Date.now()}`,
		reporterId,
		messageId,
		conversationId,
		excerpt: normalizedTokens.join(', '),
		tokens: normalizedTokens,
		timestamp: new Date().toISOString(),
	}

	appendLogEntry(entry)

	const { promoted } = await updateWordCounts(normalizedTokens)

	persistReportFiles()

	return {
		tokens: normalizedTokens,
		addedWords: promoted,
	}
}

export const downloadReportFiles = () => {
	if (!isBrowser) {
		throw new Error('Chức năng export chỉ dùng được trên trình duyệt')
	}
	persistReportFiles()
}

export const getPendingWordCounts = () => {
	return { ...wordCounts }
}
