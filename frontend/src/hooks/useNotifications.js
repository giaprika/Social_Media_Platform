import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import * as notificationApi from "../api/notification";

const GATEWAY_URL = process.env.REACT_APP_GATEWAY_URL || "http://localhost:8000";

export const useNotifications = (token) => {
  const [notifications, setNotifications] = useState([]);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial notifications from API
  const loadNotifications = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await notificationApi.getNotifications();

      // Transform API data to match component format
      const rawNotifications = Array.isArray(data) ? data : (data?.data || []);

      const extractSender = (body) => {
        if (!body) return null;
        const match = body.match(/^u\/([^\s]+)/);
        return match ? match[1] : null;
      };

      const transformed = rawNotifications.map((n) => ({
        id: n.id,
        title: n.title_template,
        message: n.body_template,
        content: n.body_template,
        read: n.is_readed,
        link: n.link_url,
        createdAt: n.updated_at || n.created_at,
        type: n.notification_type || n.type,
        actors_count: n.actors_count || 1,
        last_actor_name: n.last_actor_name,
        sender: n.last_actor_name || extractSender(n.body_template),
        isAggregated: !!n.notification_type,
      }));

      setNotifications(transformed);
    } catch (err) {
      console.error("Failed to load notifications:", err);
      setError(err.message);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await notificationApi.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    try {
      await notificationApi.markAllAsRead(unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [notifications]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await notificationApi.deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Socket connection for realtime updates
  useEffect(() => {
    if (!token) return;

    const newSocket = io(GATEWAY_URL, {
      auth: { token },
      withCredentials: true,
    });

    newSocket.on("connect", () => {
      console.log("🔔 Notification socket connected:", newSocket.id);
    });

    newSocket.on("notification", (data) => {
      console.log("🔔 New notification received:", data);

      const newNotification = {
        id: data.id || `temp-${Date.now()}`,
        title: data.title,
        message: data.body,
        content: data.body,
        read: false,
        link: data.link,
        createdAt: data.createdAt || new Date().toISOString(),
        type: data.notification_type || data.type,
        actors_count: data.actors_count || 1,
        last_actor_name: data.last_actor_name,
        sender: data.last_actor_name || (data.body && data.body.match(/^u\/([^\s]+)/) ? data.body.match(/^u\/([^\s]+)/)[1] : null),
        isAggregated: !!data.notification_type,
      };

      setNotifications((prev) => {
        // For aggregated notifications, update existing instead of adding new
        if (data.id) {
          const existingIndex = prev.findIndex((n) => n.id === data.id);
          if (existingIndex !== -1) {
            // Update existing notification and move to top
            const updated = [...prev];
            updated.splice(existingIndex, 1);
            return [{ ...newNotification, read: false }, ...updated];
          }
        }

        // Check if this is an update to an existing aggregated notification (by type + reference)
        if (data.isNew === false && data.notification_type) {
          // Find and remove old notification of same type, this one replaces it
          const filtered = prev.filter((n) => n.id !== data.id);
          return [newNotification, ...filtered];
        }

        // Add new notification at the top
        return [newNotification, ...prev];
      });
    });

    newSocket.on("disconnect", () => {
      console.log("🔔 Notification socket disconnected");
    });

    newSocket.on("connect_error", (err) => {
      console.error("🔔 Socket connection error:", err.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token]);

  // Calculate unread count
  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    socket,
    loading,
    error,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: loadNotifications,
  };
};

export default useNotifications;
