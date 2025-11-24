import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { message } from "antd";
import * as auth from "src/api/auth";
import useAuth from "src/hooks/useAuth";
import { PATHS } from "src/constants/paths";
import { validateEmail, validatePassword } from "src/utils/validate";
import TestAccountCard from "src/components/TestAccountCard";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFillCredentials = (testEmail, testPassword) => {
    setEmail(testEmail);
    setPassword(testPassword);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!validateEmail(email)) {
      setError("Invalid email address");
      return;
    }

    if (!validatePassword(password)) {
      setError(
        "Password must be at least 8 characters and include uppercase, lowercase, and a number"
      );
      return;
    }

    try {
      setLoading(true);
      const { data } = await auth.login({ email, password });
      await login({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        userId: data.user.id,
        user: data.user,
      });
      message.success("Login successful!");
      navigate(PATHS.FEED);
    } catch (err) {
      console.error(err);
  setError("Login failed. Please try again.");
  message.error("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <span className="text-xl font-bold text-primary-foreground">S</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">SocialApp</h1>
          <p className="mt-2 text-muted-foreground">Welcome back</p>
        </div>

        {/* Test Account Card - Only show in development */}
        {process.env.NODE_ENV === "development" && (
          <TestAccountCard onFillCredentials={handleFillCredentials} />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border bg-card px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-card px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-muted-foreground">
            Don't have an account?{" "}
            <Link to={PATHS.SIGNUP} className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
