/**
 * CitationPreview — Hover preview card for document citations
 * Glassmorphic floating card with excerpt snippet
 */
"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import type { SearchHit } from "@/types/api";

interface CitationPreviewProps {
  citation: SearchHit;
  children: React.ReactNode;
  onClick?: () => void;
}

export function CitationPreview({ citation, children, onClick }: CitationPreviewProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<"above" | "below">("above");
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition(rect.top > window.innerHeight - rect.bottom ? "above" : "below");
    }
  }, [isVisible]);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const excerpt = citation.chunk_text.length > 150 ? citation.chunk_text.slice(0, 150) + "..." : citation.chunk_text;

  return (
    <div ref={triggerRef} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div onClick={onClick} className="cursor-pointer">{children}</div>

      {isVisible && (
        <div
          className="absolute z-50 w-72 p-4 rounded-xl pointer-events-none"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            [position === "above" ? "bottom" : "top"]: "calc(100% + 8px)",
            background: "rgba(19, 28, 43, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            animation: "fadeInScale 0.15s ease-out",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(200, 220, 255, 0.1)" }}>
              <Icon name="description" size={16} style={{ color: "hsl(200, 90%, 65%)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "hsl(210, 40%, 98%)" }}>{citation.filename}</p>
              <div className="flex items-center gap-2 text-xs" style={{ color: "hsl(215, 20%, 55%)" }}>
                {citation.page_number && <span>Page {citation.page_number}</span>}
                <span className="px-1.5 py-0.5 rounded" style={{ background: "hsl(262 80% 65% / 0.15)", color: "hsl(262, 80%, 70%)" }}>
                  {(citation.score * 100).toFixed(0)}% match
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "hsl(215, 20%, 75%)" }}>"{excerpt}"</p>
          <div className="mt-3 pt-3 flex items-center gap-1 text-xs" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", color: "hsl(215, 20%, 45%)" }}>
            <Icon name="touch_app" size={12} />
            Click to view full details
          </div>
        </div>
      )}
    </div>
  );
}
