/**
 * Content Filter Utility
 * Lọc và che các từ ngữ độc hại/không phù hợp trong tin nhắn
 */

let offensiveWords = [];
let isLoaded = false;

/**
 * Load danh sách từ cấm từ file offensive_words.txt
 */
const loadOffensiveWords = async () => {
  if (isLoaded) return offensiveWords;

  try {
    const response = await fetch('/offensive_words.txt');
    const text = await response.text();
    
    // Parse file: mỗi dòng là 1 từ cấm
    offensiveWords = text
      .split('\n')
      .map(word => word.trim().toLowerCase())
      .filter(word => word.length > 0);
    
    isLoaded = true;
    console.log(`[ContentFilter] Loaded ${offensiveWords.length} offensive words`);
    return offensiveWords;
  } catch (error) {
    console.error('[ContentFilter] Failed to load offensive words:', error);
    return [];
  }
};

/**
 * Escape special regex characters
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Tạo regex pattern để match từ cấm (bao gồm cả duplicate)
 * @param {string} word - Từ cấm
 * @returns {RegExp} - Pattern để match
 */
const createWordPattern = (word) => {
  const escapedWord = escapeRegex(word);
  // Match: từ đơn hoặc từ lặp lại liên tiếp (fuckfuckfuck)
  // (?:^|\\s|[^a-zàáảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])
  // -> word boundary (bắt đầu, khoảng trắng, hoặc ký tự đặc biệt)
  return new RegExp(
    `(${escapedWord})+`,
    'gi'
  );
};

/**
 * Lọc nội dung: thay thế từ cấm bằng dấu *
 * @param {string} text - Nội dung gốc
 * @returns {Promise<string>} - Nội dung đã lọc
 */
export const filterOffensiveContent = async (text) => {
  if (!text || typeof text !== 'string') return text;

  // Load từ cấm nếu chưa load
  if (!isLoaded) {
    await loadOffensiveWords();
  }

  if (offensiveWords.length === 0) {
    console.warn('[ContentFilter] No offensive words loaded, returning original text');
    return text;
  }

  let filteredText = text;

  // Sort theo độ dài giảm dần để ưu tiên từ dài hơn
  // Ví dụ: "óc chó" match trước "chó"
  const sortedWords = [...offensiveWords].sort((a, b) => b.length - a.length);

  sortedWords.forEach(word => {
    const pattern = createWordPattern(word);
    
    // Thay thế từ cấm bằng * (giữ nguyên độ dài)
    filteredText = filteredText.replace(pattern, (match) => {
      // match có thể là "fuck" hoặc "fuckfuckfuck"
      return '*'.repeat(match.length);
    });
  });

  // Log nếu có thay đổi
  if (filteredText !== text) {
    console.log('[ContentFilter] Content filtered:', {
      original: text,
      filtered: filteredText,
    });
  }

  return filteredText;
};

/**
 * Kiểm tra xem text có chứa từ cấm không
 * @param {string} text - Nội dung cần kiểm tra
 * @returns {Promise<boolean>} - true nếu có từ cấm
 */
export const containsOffensiveContent = async (text) => {
  if (!text || typeof text !== 'string') return false;

  if (!isLoaded) {
    await loadOffensiveWords();
  }

  const lowerText = text.toLowerCase();
  return offensiveWords.some(word => lowerText.includes(word));
};

/**
 * Pre-load offensive words khi app khởi động
 * Gọi hàm này trong App.js hoặc index.js
 */
export const preloadOffensiveWords = () => {
  loadOffensiveWords();
};

export default {
  filterOffensiveContent,
  containsOffensiveContent,
  preloadOffensiveWords,
};
