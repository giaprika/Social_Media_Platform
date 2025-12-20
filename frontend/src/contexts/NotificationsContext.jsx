import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import Cookies from "universal-cookie";
import { markAsRead as markAsReadAPI, markAllAsRead as markAllAsReadAPI } from "../api/notification";

const GATEWAY_URL = process.env.REACT_APP_GATEWAY_URL || "http://localhost:8000";

const NotificationsContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
};

export const NotificationsProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [socket, setSocket] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const cookiesRef = useRef(new Cookies());
  const isInitialized = useRef(false);
  const newNotificationCallbacks = useRef(new Set());
  const audioContextRef = useRef(null);

  // Khởi tạo audio context khi component mount
  useEffect(() => {
    // Tạo AudioContext (hỗ trợ cả webkit prefix cho Safari)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioContextRef.current = new AudioContext();
    }
  }, []);

  // Hàm phát âm thanh thông báo (giống Facebook notification)
  const playNotificationSound = useCallback(() => {
    if (!audioContextRef.current) return;

    try {
      const context = audioContextRef.current;
      
      // Tạo oscillator (tạo âm thanh)
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      
      // Kết nối: oscillator -> gainNode -> destination (speakers)
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      // Cấu hình âm thanh giống Facebook notification
      // 2 nốt nhạc nhanh: 800Hz và 1000Hz
      oscillator.frequency.setValueAtTime(800, context.currentTime);
      oscillator.frequency.setValueAtTime(1000, context.currentTime + 0.1);
      
      // Điều chỉnh âm lượng (fade in/out để mượt hơn)
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 0.2);
      
      // Bắt đầu và dừng
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.2);
      
      console.log('🔊 Notification sound played');
    } catch (err) {
      console.warn('Không thể phát âm thanh thông báo:', err);
    }
  }, []);

  // Subscribe to new notification events (for toast/alerts)
  const onNewNotification = useCallback((callback) => {
    newNotificationCallbacks.current.add(callback);
    return () => {
      newNotificationCallbacks.current.delete(callback);
    };
  }, []);

  // Hàm fetch toàn bộ thông báo từ API
  const fetchNotifications = useCallback(async () => {
    const token = cookiesRef.current.get("accessToken");
    if (!token) {
      console.warn("No token provided for fetching notifications");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${GATEWAY_URL}/api/service/notifications`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status}`);
      }

      const data = await response.json();
      console.log("Fetched notifications:", data);
      
      // Cập nhật notifications (giả sử API trả về array hoặc object có property notifications)
      const notificationList = Array.isArray(data) ? data : data.notifications || [];
      setNotifications(notificationList);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Khởi tạo socket connection (chỉ 1 lần duy nhất)
  useEffect(() => {
    // Tránh khởi tạo nhiều lần trong StrictMode
    if (isInitialized.current) {
      console.log("NotificationsProvider already initialized, skipping...");
      return;
    }

    const token = cookiesRef.current.get("accessToken");
    if (!token) {
      console.warn("No token available for socket connection");
      return;
    }

    // Tránh tạo nhiều socket connections
    if (socketRef.current?.connected) {
      console.log("Socket already connected, skipping creation");
      return;
    }

    console.log("🔌 Creating new socket connection for notifications...");
    isInitialized.current = true;

    const newSocket = io(GATEWAY_URL, {
      auth: { token },
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });

    newSocket.on("connect", () => {
      console.log("✅ Socket connected:", newSocket.id);
      // Fetch notifications ngay khi connect để hiển số lượng trên chuông
      fetchNotifications();
    });

    newSocket.on("notification", (data) => {
      console.log("🔔 New notification received (trigger only):", data);
      
      // Phát âm thanh thông báo
      playNotificationSound();
      
      // Trigger callbacks for new notification (for toast/alerts)
      newNotificationCallbacks.current.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error("Error in notification callback:", err);
        }
      });
      
      // Fetch lại notifications từ API để cập nhật danh sách mới nhất
      fetchNotifications();
    });

    newSocket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });

    newSocket.on("connect_error", (err) => {
      console.error("🚫 Socket connection error:", err.message);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      console.log("🧹 Cleaning up socket connection...");
      if (socketRef.current) {
        socketRef.current.off("notification");
        socketRef.current.off("connect");
        socketRef.current.off("disconnect");
        socketRef.current.off("connect_error");
        socketRef.current.close();
        socketRef.current = null;
      }
      isInitialized.current = false;
    };
  }, [fetchNotifications, playNotificationSound]); // Thêm dependencies

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await markAsReadAPI(notificationId);
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, is_readed: true } 
            : n
        )
      );
      
      console.log(`✅ Notification ${notificationId} marked as read`);
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
      throw error;
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const unreadIds = notifications
        .filter(n => !n.is_readed)
        .map(n => n.id);
      
      if (unreadIds.length === 0) return;
      
      await markAllAsReadAPI(unreadIds);
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_readed: true }))
      );
      
      console.log(`✅ All notifications marked as read (${unreadIds.length})`);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      throw error;
    }
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.is_readed).length;

  const value = {
    notifications,
    socket,
    fetchNotifications,
    onNewNotification,
    markAsRead,
    markAllAsRead,
    unreadCount,
    isLoading,
    error,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};
