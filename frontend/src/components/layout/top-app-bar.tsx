/**
 * TopAppBar - Fixed header with title, tabs, and notifications
 * Glassmorphic floating design per Command Center specs
 */

"use client";

import { usePathname } from "next/navigation";
import { Icon, Icons } from "@/components/ui";

interface TopAppBarProps {
  title?: string;
  subtitle?: string;
  showSearch?: boolean;
  actions?: React.ReactNode;
}

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Global Dashboard", subtitle: "System Overview" },
  "/documents": { title: "Document Matrix", subtitle: "Intelligence Analysis" },
  "/search": { title: "Intelligence Terminal", subtitle: "Semantic Query Interface" },
  "/graph": { title: "Reasoning Graph", subtitle: "AI Decision Visualization" },
};

export function TopAppBar({ 
  title, 
  subtitle,
  showSearch = false,
  actions 
}: TopAppBarProps) {
  const pathname = usePathname();
  
  // Get page-specific title or use provided
  const pageInfo = PAGE_TITLES[pathname] || { title: "Command Center", subtitle: "" };
  const displayTitle = title || pageInfo.title;
  const displaySubtitle = subtitle || pageInfo.subtitle;

  return (
    <header
      className="glass-elevated"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 24,
        borderRadius: 16,
      }}
    >
      {/* Title Section */}
      <div>
        <h1 
          className="font-display"
          style={{ 
            fontSize: "1.5rem", 
            fontWeight: 600,
            color: "hsl(210, 40%, 98%)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {displayTitle}
        </h1>
        {displaySubtitle && (
          <p style={{ 
            fontSize: "13px", 
            color: "hsl(215, 20%, 55%)",
            margin: "4px 0 0 0",
            letterSpacing: "0.02em",
          }}>
            {displaySubtitle}
          </p>
        )}
      </div>

      {/* Center: Search (optional) */}
      {showSearch && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "var(--surface-container)",
            borderRadius: 10,
            minWidth: 300,
          }}
        >
          <Icon name={Icons.search} size={18} style={{ color: "hsl(215, 20%, 55%)" }} />
          <input
            type="text"
            placeholder="Search documents..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "hsl(210, 40%, 98%)",
              fontSize: 14,
            }}
          />
          <span style={{ 
            fontSize: 11, 
            color: "hsl(215, 20%, 45%)",
            padding: "2px 6px",
            background: "var(--surface-container-high)",
            borderRadius: 4,
          }}>
            ⌘K
          </span>
        </div>
      )}

      {/* Right: Actions + Notifications */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {actions}
        
        {/* Notification Bell */}
        <button
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--surface-container)",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-container-high)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--surface-container)";
          }}
        >
          <Icon name={Icons.notification} size={20} style={{ color: "hsl(215, 20%, 65%)" }} />
          {/* Notification dot */}
          <span
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "hsl(262, 80%, 70%)",
              boxShadow: "0 0 8px hsl(262, 80%, 70%)",
            }}
          />
        </button>
      </div>
    </header>
  );
}
