/**
 * ViewerModeToggle — Toggle between panel and modal viewer modes
 * Kinetic Observatory design with gradient highlights
 */
"use client";

import { Icon } from "@/components/ui/icon";

export type ViewerMode = "panel" | "modal";

interface ViewerModeToggleProps {
  mode: ViewerMode;
  onChange: (mode: ViewerMode) => void;
}

export function ViewerModeToggle({ mode, onChange }: ViewerModeToggleProps) {
  return (
    <div
      className="flex items-center rounded-lg p-1"
      style={{ background: "rgba(255, 255, 255, 0.04)" }}
    >
      <button
        onClick={() => onChange("panel")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
          mode === "panel"
            ? "text-white"
            : "text-slate-400 hover:text-slate-200"
        }`}
        style={
          mode === "panel"
            ? {
                background:
                  "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
                boxShadow: "0 2px 8px hsl(262 80% 70% / 0.3)",
              }
            : {}
        }
        title="View in side panel"
      >
        <Icon name="view_sidebar" size={18} />
        <span className="hidden sm:inline">Panel</span>
      </button>

      <button
        onClick={() => onChange("modal")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
          mode === "modal"
            ? "text-white"
            : "text-slate-400 hover:text-slate-200"
        }`}
        style={
          mode === "modal"
            ? {
                background:
                  "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
                boxShadow: "0 2px 8px hsl(262 80% 70% / 0.3)",
              }
            : {}
        }
        title="View in fullscreen modal"
      >
        <Icon name="fullscreen" size={18} />
        <span className="hidden sm:inline">Fullscreen</span>
      </button>
    </div>
  );
}
