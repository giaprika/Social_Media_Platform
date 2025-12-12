import React from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Button from "./ui/Button";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <div className="mb-4 flex justify-center">
              <ExclamationTriangleIcon className="h-16 w-16 text-destructive" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-foreground">
              Đã xảy ra lỗi
            </h1>
            <p className="mb-6 text-muted-foreground">
              Rất tiếc, đã có lỗi xảy ra. Vui lòng thử lại sau.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mb-6 rounded-lg border border-border bg-card p-4 text-left">
                <summary className="cursor-pointer font-semibold text-foreground">
                  Chi tiết lỗi (Development)
                </summary>
                <pre className="mt-2 overflow-auto text-xs text-muted-foreground">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="flex gap-4 justify-center">
              <Button onClick={this.handleReset}>Thử lại</Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/")}
              >
                Về trang chủ
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

