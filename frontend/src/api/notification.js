import api from './axios'

const NOTIFICATION_PATH = '/api/service/notifications'

/**
 * Get all notifications for current user
 * @returns {Promise<Array>}
 */
export const getNotifications = async () => {
    // Gateway rewrites ^/api/service/notifications -> /notifications
    // Service mounts at /notifications
    // Code calls / (root) on service router
    const response = await api.get(NOTIFICATION_PATH)
    return response.data
}

/**
 * Mark a notification as read
 * @param {string} notificationId
 * @returns {Promise<Object>}
 */
export const markAsRead = async (notificationId) => {
    // PATCH /notifications/:id/read
    const response = await api.patch(
        `${NOTIFICATION_PATH}/${notificationId}/read`
    )
    return response.data
}

/**
 * Delete a notification
 * @param {string} notificationId
 * @returns {Promise<void>}
 */
export const deleteNotification = async (notificationId) => {
    // DELETE /notifications/:id
    await api.delete(`${NOTIFICATION_PATH}/${notificationId}`)
}

/**
 * Mark all notifications as read
 * @param {string[]} notificationIds
 * @returns {Promise<void>}
 */
export const markAllAsRead = async (notificationIds) => {
    await Promise.all(notificationIds.map((id) => markAsRead(id)))
}

export default {
    getNotifications,
    markAsRead,
    deleteNotification,
    markAllAsRead,
}
