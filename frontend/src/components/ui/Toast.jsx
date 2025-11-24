import { useEffect } from "react";
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

const Toast = ({ message, type = "info", onClose, duration = 5000 }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: CheckCircleIcon,
    error: ExclamationCircleIcon,
    warning: ExclamationCircleIcon,
    info: InformationCircleIcon,
  };

  const styles = {
    success: "bg-green-500/10 border-green-500/20 text-green-500",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
    info: "bg-primary/10 border-primary/20 text-primary",
  };

  const Icon = icons[type];

  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-lg border p-4 shadow-lg",
        styles[type]
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/10"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default Toast;

