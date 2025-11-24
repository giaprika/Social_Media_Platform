import clsx from "clsx";

const Card = ({ children, className, hover = false, onClick, ...props }) => {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "rounded-lg border border-border bg-card p-4",
        hover && "transition-colors hover:border-primary/50 cursor-pointer",
        onClick && "cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

const CardHeader = ({ children, className, ...props }) => {
  return (
    <div className={clsx("mb-4", className)} {...props}>
      {children}
    </div>
  );
};

const CardTitle = ({ children, className, ...props }) => {
  return (
    <h3 className={clsx("text-lg font-bold text-foreground", className)} {...props}>
      {children}
    </h3>
  );
};

const CardContent = ({ children, className, ...props }) => {
  return (
    <div className={clsx("text-muted-foreground", className)} {...props}>
      {children}
    </div>
  );
};

const CardFooter = ({ children, className, ...props }) => {
  return (
    <div className={clsx("mt-4 pt-4 border-t border-border", className)} {...props}>
      {children}
    </div>
  );
};

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;

