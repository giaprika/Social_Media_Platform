import clsx from "clsx";

const Badge = ({ children, variant = "default", className, ...props }) => {
  const variants = {
    default: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-green-500/10 text-green-500",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;

