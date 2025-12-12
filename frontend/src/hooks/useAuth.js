import React, { useState } from "react";
import Cookies from "universal-cookie";
import { getMe } from "src/api/user";

const authContext = React.createContext();

function useAuth() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const cookies = new Cookies();

  const writeCookies = ({ accessToken, refreshToken, userId }) => {
    const cookieOptions = {
      path: "/",
    };

    console.log("accessToken", accessToken);
    console.log("refreshToken", refreshToken);
    console.log("x-user-id", userId);
    console.log("cookieOptions", cookieOptions);

    // Store raw token; header builder will add Bearer
    cookies.set("accessToken", accessToken, cookieOptions);
    cookies.set("x-user-id", userId, cookieOptions);

    if (refreshToken) {
      cookies.set("refreshToken", refreshToken, cookieOptions);
    }

    console.log("Cookies after setting:", cookies.getAll());
  };

  // Helper function để verify cookies đã được set
  const verifyCookies = () => {
    const accessToken = cookies.get("accessToken");
    const userId = cookies.get("x-user-id");
    const refreshToken = cookies.get("refreshToken");

    console.log("Verifying cookies:", {
      accessToken: !!accessToken,
      userId: !!userId,
      refreshToken: !!refreshToken,
    });

    console.log("Cookies:", cookies.getAll());

    return Boolean(accessToken && userId);
  };

  return {
    authed,
    user,
    refresh() {
      return new Promise(async (res) => {
        const isAuthenticated = verifyCookies();
        setAuthed(isAuthenticated);
        if (isAuthenticated) {
          try {
            const { data } = await getMe();
            console.log("Fetched current user (/me):", data);
            setUser(data);
          } catch (e) {
            console.error("Failed to fetch current user (/me):", e);
            setUser(null);
          }
        } else {
          setUser(null);
        }
        res(isAuthenticated);
      });
    },

    login({ accessToken, refreshToken, userId, user: userPayload }) {
      return new Promise((res, rej) => {
        try {
          // Set cookies
          writeCookies({ accessToken, refreshToken, userId });

          const verifyWithRetry = (attempts = 0) => {
            const isVerified = verifyCookies();

            if (isVerified) {
              console.log("Cookies verified successfully");
              setAuthed(true);
              if (userPayload) {
                setUser(userPayload);
              } else {
                getMe()
                  .then(({ data }) => setUser(data))
                  .catch(() => setUser({ id: userId }));
              }
              res(true);
            } else if (attempts < 3) {
              console.log(
                `Cookie verification failed, retrying... (${attempts + 1}/3)`
              );
              setTimeout(() => verifyWithRetry(attempts + 1), 50);
            } else {
              console.error("Failed to verify cookies after 3 attempts");
              rej(new Error("Failed to set authentication cookies"));
            }
          };

          setTimeout(() => verifyWithRetry(), 10);
        } catch (error) {
          console.error("Login error:", error);
          rej(error);
        }
      });
    },

    logout() {
      return new Promise((resolve) => {
        console.log("Logging out from the main system...");

        cookies.remove("accessToken", { path: "/" });
        cookies.remove("refreshToken", { path: "/" });
        cookies.remove("Authorization", { path: "/" });
        cookies.remove("x-user-id", { path: "/" });

        setAuthed(false);
        setUser(null);

        resolve();
      });
    },
  };
}

export function AuthProvider({ children }) {
  const auth = useAuth();
  return <authContext.Provider value={auth}>{children}</authContext.Provider>;
}

export default function AuthConsumer() {
  return React.useContext(authContext);
}
