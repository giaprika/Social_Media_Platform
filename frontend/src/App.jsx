import React from "react";
import { Router } from "./routes";
import { NotificationsProvider } from "./contexts/NotificationsContext";

function App() {
  return (
    <NotificationsProvider>
      <Router />
    </NotificationsProvider>
  );
}

export default App;
