import instance from './axios'
import axios from 'axios'

const API_BASE_URL =
	process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'

const instanceWithoutCredential = axios.create({ baseURL: API_BASE_URL })

const signup = (credential) => {
	return instanceWithoutCredential.post('/api/users/register', credential)
}
const login = (credential) =>
	instanceWithoutCredential.post('/api/users/login', credential)

const refreshToken = () => instance.get('/api/users/refresh-token')

export { signup, login, refreshToken }
