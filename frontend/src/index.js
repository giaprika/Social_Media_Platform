import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";

import { AuthProvider } from "src/hooks/useAuth";
import { ToastProvider } from "src/components/ui";
import { ThemeProvider } from "src/contexts/ThemeContext";
import { ChatProvider } from "src/contexts/ChatContext";
import { CommunityProvider } from "src/contexts/CommunityContext";
import ErrorBoundary from "src/components/ErrorBoundary";
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <ErrorBoundary>
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <AuthProvider>
          <ChatProvider>
            <CommunityProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </CommunityProvider>
          </ChatProvider>
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </ErrorBoundary>
);

