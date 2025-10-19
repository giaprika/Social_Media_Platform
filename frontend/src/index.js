import ReactDOM from "react-dom/client";
import { AuthProvider } from "src/hooks/useAuth";
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
