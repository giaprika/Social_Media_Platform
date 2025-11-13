import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const GATEWAY_URL = process.env.REACT_APP_GATEWAY_URL || "http://localhost:8000";

export const useNotifications = (token) => {
  const [notifications, setNotifications] = useState([]);
  const [socket, setSocket] = useState(null);

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

  return { notifications, socket };
};