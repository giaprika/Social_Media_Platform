import { useState, useEffect } from "react";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import Skeleton from "./Skeleton";

const LinkPreview = ({ url, compact = false }) => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Simulate fetching link preview
    // In production, you would call an API service like linkpreview.net or og-scraper
    const fetchPreview = async () => {
      try {
        setLoading(true);
        // Mock preview data
        const urlObj = new URL(url);
        const mockPreview = {
          title: urlObj.hostname.replace("www.", ""),
          description: "Click to visit this link",
          image: null,
          url: url,
          domain: urlObj.hostname,
        };
        
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        setPreview(mockPreview);
        setError(false);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (url) {
      fetchPreview();
    }
  }, [url]);

  if (loading) {
    return (
      <div className="my-3 rounded-lg border border-border bg-muted/30 p-3">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <GlobeAltIcon className="h-4 w-4" />
        {url}
      </a>
    );
  }

  if (compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="my-3 flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
      >
        <GlobeAltIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {preview.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {preview.domain}
          </p>
        </div>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-3 block overflow-hidden rounded-lg border border-border bg-muted/30 transition-colors hover:bg-muted/50"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt={preview.title}
          className="w-full h-48 object-cover"
          onError={(e) => {
            e.target.style.display = "none";
          }}
        />
      )}
      <div className="p-3">
        <p className="text-sm font-semibold text-foreground mb-1 line-clamp-2">
          {preview.title}
        </p>
        {preview.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
            {preview.description}
          </p>
        )}
        <div className="flex items-center gap-1 text-xs text-primary">
          <GlobeAltIcon className="h-3 w-3" />
          <span>{preview.domain}</span>
        </div>
      </div>
    </a>
  );
};

export default LinkPreview;

