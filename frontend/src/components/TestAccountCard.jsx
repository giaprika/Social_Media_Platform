import { useState } from "react";
import { ClipboardDocumentIcon, CheckIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import Card from "./ui/Card";
import Button from "./ui/Button";

const TEST_ACCOUNT = {
  email: "test@socialapp.com",
  password: "Test123456",
};

const TestAccountCard = ({ onFillCredentials }) => {
  const [copied, setCopied] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ ...copied, [type]: true });
      setTimeout(() => {
        setCopied({ ...copied, [type]: false });
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFillAndLogin = () => {
    if (onFillCredentials) {
      onFillCredentials(TEST_ACCOUNT.email, TEST_ACCOUNT.password);
    }
  };

  return (
    <Card className="border-primary/50 bg-primary/5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">🧪 Test Account</h3>
        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
          Development
        </span>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Sử dụng tài khoản test này để đăng nhập nhanh
      </p>

      <div className="space-y-3">
        {/* Email */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Email
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={TEST_ACCOUNT.email}
              readOnly
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(TEST_ACCOUNT.email, "email")}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Copy email"
            >
              {copied.email ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Password
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showPassword ? "text" : "password"}
                value={TEST_ACCOUNT.password}
                readOnly
                className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(TEST_ACCOUNT.password, "password")}
              className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Copy password"
            >
              {copied.password ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {onFillCredentials && (
        <Button
          onClick={handleFillAndLogin}
          className="mt-4 w-full"
          size="sm"
        >
          Fill & Login
        </Button>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        💡 Click vào icon clipboard để copy
      </p>
    </Card>
  );
};

export default TestAccountCard;

