import ReactDOM from "react-dom/client";
import { AuthProvider } from "src/hooks/useAuth";
import { ToastProvider } from "src/components/ui";
import { ThemeProvider } from "src/contexts/ThemeContext";
import ErrorBoundary from "src/components/ErrorBoundary";
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
