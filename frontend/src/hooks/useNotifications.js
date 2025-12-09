import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";

const GATEWAY_URL = process.env.REACT_APP_GATEWAY_URL || "http://localhost:8000";

export const useNotifications = (token) => {
  const [notifications, setNotifications] = useState([]);
  const [socket, setSocket] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Hàm fetch toàn bộ thông báo từ API
  const fetchNotifications = useCallback(async () => {
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
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const newSocket = io(GATEWAY_URL, {
      auth: { token },
      withCredentials: true,
    });

    newSocket.on("connect", () => {
      console.log("Socket connected:", newSocket.id);
    });

    newSocket.on("notification", (data) => {
      console.log("New notification received:", data);
      setNotifications((prev) => [data, ...prev]);
      // Hiển thị toast (ví dụ: react-toastify)
      // toast.info(data.title);
    });

    newSocket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token]);

  return { 
    notifications, 
    socket, 
    fetchNotifications, 
    isLoading, 
    error 
  };
};
