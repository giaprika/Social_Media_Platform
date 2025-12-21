/**
 * Content Filter Utility
 * Lọc và che các từ ngữ độc hại/không phù hợp trong tin nhắn
 */

let offensiveWords = []
let isLoaded = false

const CUSTOM_WORDS_KEY = 'chat_custom_offensive_words'

const isBrowser =
	typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const readCustomWords = () => {
	if (!isBrowser) return []
	try {
		const stored = window.localStorage.getItem(CUSTOM_WORDS_KEY)
		if (!stored) return []
		const parsed = JSON.parse(stored)
		return Array.isArray(parsed)
			? parsed
					.map((word) =>
						typeof word === 'string' ? word.trim().toLowerCase() : ''
					)
					.filter((word) => word.length > 0)
			: []
	} catch (error) {
		console.warn(
			'[ContentFilter] Failed to parse custom offensive words',
			error
		)
		return []
	}
}

const writeCustomWords = (words) => {
	if (!isBrowser) return
	try {
		window.localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(words))
	} catch (error) {
		console.warn(
			'[ContentFilter] Failed to persist custom offensive words',
			error
		)
	}
}

const mergeCustomWords = () => {
	const extras = readCustomWords()
	if (!extras.length) return
	const baseSet = new Set(offensiveWords)
	extras.forEach((word) => {
		if (!baseSet.has(word)) {
			baseSet.add(word)
			offensiveWords.push(word)
		}
	})
}

/**
 * Load danh sách từ cấm từ file offensive_words.txt
 */
const loadOffensiveWords = async () => {
	if (isLoaded) return offensiveWords

	try {
		const response = await fetch('/offensive_words.txt')
		const text = await response.text()

		// Parse file: mỗi dòng là 1 từ cấm
		offensiveWords = text
			.split('\n')
			.map((word) => word.trim().toLowerCase())
			.filter((word) => word.length > 0)

		mergeCustomWords()
		isLoaded = true
		console.log(
			`[ContentFilter] Loaded ${offensiveWords.length} offensive words (including custom entries)`
		)
		return offensiveWords
	} catch (error) {
		console.error('[ContentFilter] Failed to load offensive words:', error)
		return []
	}
}

/**
 * Escape special regex characters
 */
const escapeRegex = (str) => {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Tạo regex pattern để match từ cấm (bao gồm cả duplicate)
 * @param {string} word - Từ cấm
 * @returns {RegExp} - Pattern để match
 */
const createWordPattern = (word) => {
	const escapedWord = escapeRegex(word)
	// Match: từ đơn hoặc từ lặp lại liên tiếp (fuckfuckfuck)
	// (?:^|\\s|[^a-zàáảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])
	// -> word boundary (bắt đầu, khoảng trắng, hoặc ký tự đặc biệt)
	return new RegExp(`(${escapedWord})+`, 'gi')
}

/**
 * Lọc nội dung: thay thế từ cấm bằng dấu *
 * @param {string} text - Nội dung gốc
 * @returns {Promise<string>} - Nội dung đã lọc
 */
export const filterOffensiveContent = async (text) => {
	if (!text || typeof text !== 'string') return text

	// Load từ cấm nếu chưa load
	if (!isLoaded) {
		await loadOffensiveWords()
	}

	if (offensiveWords.length === 0) {
		console.warn(
			'[ContentFilter] No offensive words loaded, returning original text'
		)
		return text
	}

	let filteredText = text

	// Sort theo độ dài giảm dần để ưu tiên từ dài hơn
	// Ví dụ: "óc chó" match trước "chó"
	const sortedWords = [...offensiveWords].sort((a, b) => b.length - a.length)

	sortedWords.forEach((word) => {
		const pattern = createWordPattern(word)

		// Thay thế từ cấm bằng * (giữ nguyên độ dài)
		filteredText = filteredText.replace(pattern, (match) => {
			// match có thể là "fuck" hoặc "fuckfuckfuck"
			return '*'.repeat(match.length)
		})
	})

	// Log nếu có thay đổi
	if (filteredText !== text) {
		console.log('[ContentFilter] Content filtered:', {
			original: text,
			filtered: filteredText,
		})
	}

	return filteredText
}

/**
 * Kiểm tra xem text có chứa từ cấm không
 * @param {string} text - Nội dung cần kiểm tra
 * @returns {Promise<boolean>} - true nếu có từ cấm
 */
export const containsOffensiveContent = async (text) => {
	if (!text || typeof text !== 'string') return false

	if (!isLoaded) {
		await loadOffensiveWords()
	}

	const lowerText = text.toLowerCase()
	return offensiveWords.some((word) => lowerText.includes(word))
}

/**
 * Pre-load offensive words khi app khởi động
 * Gọi hàm này trong App.js hoặc index.js
 */
export const preloadOffensiveWords = () => {
	loadOffensiveWords()
}

export const getCustomOffensiveWords = () => readCustomWords()

export const appendCustomOffensiveWords = async (words = []) => {
	if (!Array.isArray(words) || words.length === 0) return

	const normalized = words
		.map((word) => (typeof word === 'string' ? word.trim().toLowerCase() : ''))
		.filter((word) => word.length > 0)

	if (!normalized.length) return

	const current = new Set(readCustomWords())
	let changed = false

	normalized.forEach((word) => {
		if (!current.has(word)) {
			current.add(word)
			changed = true
		}
	})

	if (!changed) return

	writeCustomWords(Array.from(current))

	if (!isLoaded) {
		await loadOffensiveWords()
		return
	}

	const baseSet = new Set(offensiveWords)
	normalized.forEach((word) => {
		if (!baseSet.has(word)) {
			baseSet.add(word)
			offensiveWords.push(word)
		}
	})
}

export default {
	filterOffensiveContent,
	containsOffensiveContent,
	preloadOffensiveWords,
	appendCustomOffensiveWords,
	getCustomOffensiveWords,
}
