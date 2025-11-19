import { useState, useEffect } from "react";

export const useNotifications = (token) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual API call
        // const response = await fetch('/api/notifications', {
        //   headers: {
        //     Authorization: `Bearer ${token}`
        //   }
        // });
        // const data = await response.json();
        
        // Mock notifications for now
        const mockNotifications = [];
        
        setNotifications(mockNotifications);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
        setError(err.message);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);

    return () => clearInterval(interval);
  }, [token]);

  return { notifications, loading, error };
};

