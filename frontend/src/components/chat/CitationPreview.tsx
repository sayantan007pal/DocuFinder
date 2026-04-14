/**
 * CitationPreview — Hover preview card for document citations
 * Kinetic Observatory design aligned with Command Center dashboard
 */
"use client";

import { useState, useRef, useEffect, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";
import { ProgressBar } from "@/components/ui/progress-bar";
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
  const scorePercent = Math.round(citation.score * 100);

  // Card positioning styles
  const cardPositionStyles: CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    [position === "above" ? "bottom" : "top"]: "calc(100% + 10px)",
    zIndex: 50,
    width: 300,
    pointerEvents: "none",
  };

  return (
    <div ref={triggerRef} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div onClick={onClick} className="cursor-pointer">{children}</div>

      {isVisible && (
        <div style={cardPositionStyles}>
          <GlassmorphicCard 
            variant="elevated" 
            style={{ 
              padding: 16,
              animation: "fadeInScale 0.15s ease-out",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
              <div 
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, hsl(200 90% 65% / 0.15), hsl(200 90% 65% / 0.05))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="description" size={20} style={{ color: "hsl(200, 90%, 65%)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p 
                  className="truncate" 
                  style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: "hsl(210, 40%, 98%)",
                    marginBottom: 2,
                  }}
                >
                  {citation.filename}
                </p>
                <div className="flex items-center gap-2">
                  {citation.page_number && (
                    <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
                      Page {citation.page_number}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Match Score */}
            <div style={{ marginBottom: 12 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span 
                  style={{ 
                    fontSize: 11, 
                    fontWeight: 600, 
                    textTransform: "uppercase", 
                    letterSpacing: "0.1em",
                    color: "hsl(215, 20%, 55%)",
                  }}
                >
                  Match Score
                </span>
                <span 
                  style={{ 
                    fontSize: 13, 
                    fontWeight: 600,
                    color: scorePercent >= 70 ? "hsl(142, 76%, 50%)" : scorePercent >= 50 ? "hsl(38, 92%, 50%)" : "hsl(215, 20%, 65%)",
                  }}
                >
                  {scorePercent}%
                </span>
              </div>
              <ProgressBar 
                value={scorePercent} 
                variant={scorePercent >= 70 ? "success" : scorePercent >= 50 ? "warning" : "gradient"}
                size="sm"
              />
            </div>

            {/* Excerpt */}
            <p 
              style={{ 
                fontSize: 13, 
                lineHeight: 1.5, 
                color: "hsl(215, 20%, 75%)",
                fontStyle: "italic",
              }}
            >
              "{excerpt}"
            </p>

            {/* Footer hint */}
            <div 
              className="flex items-center gap-1.5" 
              style={{ 
                marginTop: 12, 
                paddingTop: 12, 
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <Icon name="touch_app" size={12} style={{ color: "hsl(215, 20%, 45%)" }} />
              <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)" }}>Click to view full details</span>
            </div>
          </GlassmorphicCard>
        </div>
      )}
    </div>
  );
}
