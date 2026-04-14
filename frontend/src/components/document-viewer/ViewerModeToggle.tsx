/**
 * ViewerModeToggle — Toggle between panel and modal viewer modes
 * Command Center design with gradient highlights
 */
"use client";

import { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";

export type ViewerMode = "panel" | "modal";

interface ViewerModeToggleProps {
  mode: ViewerMode;
  onChange: (mode: ViewerMode) => void;
}

export function ViewerModeToggle({ mode, onChange }: ViewerModeToggleProps) {
  const containerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    borderRadius: 10,
    padding: 4,
    background: "rgba(255, 255, 255, 0.04)",
    gap: 2,
  };

  const getButtonStyles = (isActive: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
    color: isActive ? "white" : "hsl(215, 20%, 55%)",
    background: isActive 
      ? "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)"
      : "transparent",
    boxShadow: isActive 
      ? "0 2px 10px hsl(262 80% 70% / 0.35)"
      : "none",
  });

  const labelStyles: CSSProperties = {
    display: "none",
  };

  return (
    <div style={containerStyles}>
      <button
        onClick={() => onChange("panel")}
        style={getButtonStyles(mode === "panel")}
        onMouseEnter={(e) => {
          if (mode !== "panel") {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
            e.currentTarget.style.color = "hsl(210, 40%, 98%)";
          }
        }}
        onMouseLeave={(e) => {
          if (mode !== "panel") {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "hsl(215, 20%, 55%)";
          }
        }}
        title="View in side panel"
      >
        <Icon name="view_sidebar" size={18} />
        <span style={labelStyles} className="sm:inline!">Panel</span>
      </button>

      <button
        onClick={() => onChange("modal")}
        style={getButtonStyles(mode === "modal")}
        onMouseEnter={(e) => {
          if (mode !== "modal") {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
            e.currentTarget.style.color = "hsl(210, 40%, 98%)";
          }
        }}
        onMouseLeave={(e) => {
          if (mode !== "modal") {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "hsl(215, 20%, 55%)";
          }
        }}
        title="View in fullscreen modal"
      >
        <Icon name="fullscreen" size={18} />
        <span style={labelStyles} className="sm:inline!">Fullscreen</span>
      </button>
    </div>
  );
}
