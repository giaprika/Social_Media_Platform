import { getUploadCredentials } from '../api/chat'
import { CHAT_MESSAGE_TYPES } from '../api/chat'

// File size limits (MB)
const IMAGE_MAX_MB = 8
const VIDEO_MAX_MB = 50
const FILE_MAX_MB = 25

// Supported file types
const SUPPORTED_IMAGE_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
]

const SUPPORTED_VIDEO_TYPES = [
	'video/mp4',
	'video/webm',
	'video/ogg',
	'video/quicktime',
	'video/x-msvideo',
]

// Common document types
const SUPPORTED_FILE_TYPES = [
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/zip',
	'application/x-rar-compressed',
	'application/x-7z-compressed',
	'text/plain',
	'text/csv',
	'application/json',
]

const getCloudName = (credentials) =>
	credentials.cloud_name || credentials.cloudName
const getApiKey = (credentials) => credentials.api_key || credentials.apiKey
const getFolder = (credentials) => credentials.folder

/**
 * Determine the message type based on file MIME type
 * @param {File} file 
 * @returns {string} CHAT_MESSAGE_TYPES value
 */
export const getMediaTypeFromFile = (file) => {
	if (!file?.type) return CHAT_MESSAGE_TYPES.FILE

	if (file.type.startsWith('image/')) {
		return CHAT_MESSAGE_TYPES.IMAGE
	}
	if (file.type.startsWith('video/')) {
		return CHAT_MESSAGE_TYPES.VIDEO
	}
	return CHAT_MESSAGE_TYPES.FILE
}

/**
 * Get human-readable file type label
 * @param {string} messageType 
 * @returns {string}
 */
export const getFileTypeLabel = (messageType) => {
	switch (messageType) {
		case CHAT_MESSAGE_TYPES.IMAGE:
			return 'Hình ảnh'
		case CHAT_MESSAGE_TYPES.VIDEO:
			return 'Video'
		case CHAT_MESSAGE_TYPES.FILE:
			return 'Tệp đính kèm'
		default:
			return 'Tệp'
	}
}

/**
 * Validate image file
 * @param {File} file 
 * @param {number} maxSizeMb 
 */
export const validateImageFile = (file, maxSizeMb = IMAGE_MAX_MB) => {
	if (!file) {
		throw new Error('Chưa chọn file')
	}

	if (!file.type?.startsWith('image/')) {
		throw new Error('File phải là hình ảnh')
	}

	if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
		throw new Error('Định dạng ảnh không được hỗ trợ. Sử dụng: JPG, PNG, GIF, WEBP')
	}

	const maxBytes = maxSizeMb * 1024 * 1024
	if (file.size > maxBytes) {
		throw new Error(`Ảnh phải nhỏ hơn ${maxSizeMb}MB`)
	}
}

/**
 * Validate video file
 * @param {File} file 
 * @param {number} maxSizeMb 
 */
export const validateVideoFile = (file, maxSizeMb = VIDEO_MAX_MB) => {
	if (!file) {
		throw new Error('Chưa chọn file')
	}

	if (!file.type?.startsWith('video/')) {
		throw new Error('File phải là video')
	}

	if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
		throw new Error('Định dạng video không được hỗ trợ. Sử dụng: MP4, WEBM, OGG, MOV')
	}

	const maxBytes = maxSizeMb * 1024 * 1024
	if (file.size > maxBytes) {
		throw new Error(`Video phải nhỏ hơn ${maxSizeMb}MB`)
	}
}

/**
 * Validate generic file (documents, etc.)
 * @param {File} file 
 * @param {number} maxSizeMb 
 */
export const validateGenericFile = (file, maxSizeMb = FILE_MAX_MB) => {
	if (!file) {
		throw new Error('Chưa chọn file')
	}

	const maxBytes = maxSizeMb * 1024 * 1024
	if (file.size > maxBytes) {
		throw new Error(`Tệp phải nhỏ hơn ${maxSizeMb}MB`)
	}
}

/**
 * Validate any media file based on its type
 * @param {File} file 
 * @returns {{ isValid: boolean, messageType: string }}
 */
export const validateMediaFile = (file) => {
	if (!file) {
		throw new Error('Chưa chọn file')
	}

	const messageType = getMediaTypeFromFile(file)

	switch (messageType) {
		case CHAT_MESSAGE_TYPES.IMAGE:
			validateImageFile(file)
			break
		case CHAT_MESSAGE_TYPES.VIDEO:
			validateVideoFile(file)
			break
		case CHAT_MESSAGE_TYPES.FILE:
			validateGenericFile(file)
			break
		default:
			validateGenericFile(file)
	}

	return { isValid: true, messageType }
}

/**
 * Get accepted file types string for input element
 * @returns {string}
 */
export const getAcceptedFileTypes = () => {
	return [
		...SUPPORTED_IMAGE_TYPES,
		...SUPPORTED_VIDEO_TYPES,
		...SUPPORTED_FILE_TYPES,
	].join(',')
}

/**
 * Format accepted types for display
 * @returns {string}
 */
export const getAcceptedTypesDescription = () => {
	return 'Hình ảnh (JPG, PNG, GIF), Video (MP4, WEBM), Tài liệu (PDF, DOC, XLS, PPT, ZIP)'
}

export const requestChatUploadCredentials = async () => {
	const credentials = await getUploadCredentials()
	if (!credentials) {
		throw new Error('Không thể lấy thông tin upload')
	}
	return credentials
}

/**
 * Upload image to Cloudinary
 * @param {File} file 
 * @param {object} credentials 
 * @returns {Promise<object>}
 */
export const uploadImageToCloudinary = async (file, credentials) => {
	const cloudName = getCloudName(credentials)
	if (!cloudName) {
		throw new Error('Thiếu cấu hình Cloudinary')
	}

	const apiKey = getApiKey(credentials)
	const timestamp = credentials.timestamp
	const signature = credentials.signature

	if (!apiKey || !timestamp || !signature) {
		throw new Error('Thông tin upload không hợp lệ')
	}

	const formData = new FormData()
	formData.append('file', file)
	formData.append('api_key', apiKey)
	formData.append('timestamp', timestamp)
	formData.append('signature', signature)

	const folder = getFolder(credentials)
	if (folder) {
		formData.append('folder', folder)
	}

	const uploadPreset = credentials.upload_preset || credentials.uploadPreset
	if (uploadPreset) {
		formData.append('upload_preset', uploadPreset)
	}

	const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
	const response = await fetch(uploadUrl, {
		method: 'POST',
		body: formData,
	})

	const data = await response.json()

	if (!response.ok) {
		const errorMessage = data?.error?.message || 'Upload ảnh thất bại'
		throw new Error(errorMessage)
	}

	return data
}

/**
 * Upload video to Cloudinary
 * @param {File} file 
 * @param {object} credentials 
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<object>}
 */
export const uploadVideoToCloudinary = async (file, credentials, onProgress) => {
	const cloudName = getCloudName(credentials)
	if (!cloudName) {
		throw new Error('Thiếu cấu hình Cloudinary')
	}

	const apiKey = getApiKey(credentials)
	const timestamp = credentials.timestamp
	const signature = credentials.signature

	if (!apiKey || !timestamp || !signature) {
		throw new Error('Thông tin upload không hợp lệ')
	}

	const formData = new FormData()
	formData.append('file', file)
	formData.append('api_key', apiKey)
	formData.append('timestamp', timestamp)
	formData.append('signature', signature)
	formData.append('resource_type', 'video')

	const folder = getFolder(credentials)
	if (folder) {
		formData.append('folder', folder)
	}

	const uploadPreset = credentials.upload_preset || credentials.uploadPreset
	if (uploadPreset) {
		formData.append('upload_preset', uploadPreset)
	}

	// Use XHR for progress tracking
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`

		xhr.open('POST', uploadUrl)

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && onProgress) {
				const percent = Math.round((event.loaded / event.total) * 100)
				onProgress(percent)
			}
		}

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					const data = JSON.parse(xhr.responseText)
					resolve(data)
				} catch {
					reject(new Error('Phản hồi không hợp lệ từ server'))
				}
			} else {
				try {
					const errorData = JSON.parse(xhr.responseText)
					reject(new Error(errorData?.error?.message || 'Upload video thất bại'))
				} catch {
					reject(new Error('Upload video thất bại'))
				}
			}
		}

		xhr.onerror = () => {
			reject(new Error('Lỗi kết nối khi upload video'))
		}

		xhr.send(formData)
	})
}

/**
 * Upload raw file to Cloudinary (documents, etc.)
 * @param {File} file 
 * @param {object} credentials 
 * @returns {Promise<object>}
 */
export const uploadFileToCloudinary = async (file, credentials) => {
	const cloudName = getCloudName(credentials)
	if (!cloudName) {
		throw new Error('Thiếu cấu hình Cloudinary')
	}

	const apiKey = getApiKey(credentials)
	const timestamp = credentials.timestamp
	const signature = credentials.signature

	if (!apiKey || !timestamp || !signature) {
		throw new Error('Thông tin upload không hợp lệ')
	}

	const formData = new FormData()
	formData.append('file', file)
	formData.append('api_key', apiKey)
	formData.append('timestamp', timestamp)
	formData.append('signature', signature)
	formData.append('resource_type', 'raw')

	const folder = getFolder(credentials)
	if (folder) {
		formData.append('folder', folder)
	}

	const uploadPreset = credentials.upload_preset || credentials.uploadPreset
	if (uploadPreset) {
		formData.append('upload_preset', uploadPreset)
	}

	const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`
	const response = await fetch(uploadUrl, {
		method: 'POST',
		body: formData,
	})

	const data = await response.json()

	if (!response.ok) {
		const errorMessage = data?.error?.message || 'Upload tệp thất bại'
		throw new Error(errorMessage)
	}

	return data
}

/**
 * Upload any media file to Cloudinary based on its type
 * @param {File} file 
 * @param {object} credentials 
 * @param {function} onProgress - Progress callback for videos
 * @returns {Promise<{ uploadResult: object, messageType: string }>}
 */
export const uploadMediaToCloudinary = async (file, credentials, onProgress) => {
	const { messageType } = validateMediaFile(file)

	let uploadResult

	switch (messageType) {
		case CHAT_MESSAGE_TYPES.IMAGE:
			uploadResult = await uploadImageToCloudinary(file, credentials)
			break
		case CHAT_MESSAGE_TYPES.VIDEO:
			uploadResult = await uploadVideoToCloudinary(file, credentials, onProgress)
			break
		case CHAT_MESSAGE_TYPES.FILE:
			uploadResult = await uploadFileToCloudinary(file, credentials)
			break
		default:
			uploadResult = await uploadFileToCloudinary(file, credentials)
	}

	return {
		uploadResult,
		messageType,
	}
}

/**
 * Full upload flow: validate, get credentials, upload
 * @param {File} file 
 * @param {function} onProgress 
 * @returns {Promise<{ url: string, messageType: string, metadata: object }>}
 */
export const uploadChatMedia = async (file, onProgress) => {
	const { messageType } = validateMediaFile(file)
	const credentials = await requestChatUploadCredentials()
	const { uploadResult } = await uploadMediaToCloudinary(file, credentials, onProgress)

	const url = uploadResult.secure_url || uploadResult.url
	if (!url) {
		throw new Error('Không nhận được URL sau khi upload')
	}

	return {
		url,
		messageType,
		metadata: {
			width: uploadResult.width,
			height: uploadResult.height,
			bytes: uploadResult.bytes,
			format: uploadResult.format,
			resource_type: uploadResult.resource_type,
			original_filename: uploadResult.original_filename,
			duration: uploadResult.duration, // For videos
		},
	}
}

// Legacy export for backwards compatibility
export const uploadChatImage = async (file) => {
	validateImageFile(file)
	const credentials = await requestChatUploadCredentials()
	return uploadImageToCloudinary(file, credentials)
}
