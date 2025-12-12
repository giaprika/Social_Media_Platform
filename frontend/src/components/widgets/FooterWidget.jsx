const FooterWidget = () => {
  const currentYear = new Date().getFullYear();

  const links = [
    { label: "Rules", href: "/rules" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "User Agreement", href: "/terms" },
    { label: "Accessibility", href: "/accessibility" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      {/* Links */}
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 mb-2">
        {links.map((link, index) => (
          <a
            key={link.href}
            href={link.href}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors hover:underline"
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Copyright */}
      <p className="text-xs text-muted-foreground">
        SocialMedia, Inc. © {currentYear}. All rights reserved.
      </p>
    </div>
  );
};

export default FooterWidget;

