import { getUploadCredentials } from '../api/chat'

const MEDIA_DEFAULT_MAX_MB = 8

const getCloudName = (credentials) =>
	credentials.cloud_name || credentials.cloudName
const getApiKey = (credentials) => credentials.api_key || credentials.apiKey
const getFolder = (credentials) => credentials.folder

export const validateImageFile = (file, maxSizeMb = MEDIA_DEFAULT_MAX_MB) => {
	if (!file) {
		throw new Error('No image selected')
	}

	if (!file.type?.startsWith('image/')) {
		throw new Error('Only image files are supported')
	}

	const maxBytes = maxSizeMb * 1024 * 1024
	if (file.size > maxBytes) {
		throw new Error(`Image must be smaller than ${maxSizeMb}MB`)
	}
}

export const requestChatUploadCredentials = async () => {
	const credentials = await getUploadCredentials()
	if (!credentials) {
		throw new Error('Failed to get upload credentials')
	}
	return credentials
}

export const uploadImageToCloudinary = async (file, credentials) => {
	const cloudName = getCloudName(credentials)
	if (!cloudName) {
		throw new Error('Missing Cloudinary configuration')
	}

	const apiKey = getApiKey(credentials)
	const timestamp = credentials.timestamp
	const signature = credentials.signature

	if (!apiKey || !timestamp || !signature) {
		throw new Error('Invalid upload credentials')
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
		const errorMessage = data?.error?.message || 'Image upload failed'
		throw new Error(errorMessage)
	}

	return data
}

export const uploadChatImage = async (file) => {
	validateImageFile(file)
	const credentials = await requestChatUploadCredentials()
	return uploadImageToCloudinary(file, credentials)
}
