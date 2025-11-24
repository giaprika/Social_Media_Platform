import { Fragment, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import Button from "./Button";

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-full mx-4",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={clsx(
          "relative z-50 w-full rounded-2xl border border-border bg-card shadow-2xl",
          sizes[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="border-t border-border px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
};

export default Modal;

