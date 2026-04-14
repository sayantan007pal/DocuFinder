/**
 * StatusBadge - Status indicators for documents and tasks
 * Matches Command Center activity feed styling
 */

import { CSSProperties } from "react";
import { Icon } from "./icon";

type Status = "queued" | "processing" | "completed" | "failed" | "idle";

interface StatusBadgeProps {
  status: Status;
  label?: string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<Status, { 
  color: string; 
  bg: string; 
  icon: string;
  label: string;
}> = {
  queued: {
    color: "hsl(38, 92%, 50%)",
    bg: "hsl(38, 92%, 50%, 0.15)",
    icon: "schedule",
    label: "Queued",
  },
  processing: {
    color: "hsl(200, 90%, 65%)",
    bg: "hsl(200, 90%, 65%, 0.15)",
    icon: "sync",
    label: "Processing",
  },
  completed: {
    color: "hsl(142, 76%, 50%)",
    bg: "hsl(142, 76%, 50%, 0.15)",
    icon: "check_circle",
    label: "Completed",
  },
  failed: {
    color: "hsl(0, 84%, 60%)",
    bg: "hsl(0, 84%, 60%, 0.15)",
    icon: "error",
    label: "Failed",
  },
  idle: {
    color: "hsl(215, 20%, 65%)",
    bg: "hsl(215, 20%, 65%, 0.15)",
    icon: "radio_button_unchecked",
    label: "Idle",
  },
};

export function StatusBadge({
  status,
  label,
  size = "md",
  showIcon = true,
  className = "",
}: StatusBadgeProps) {
  const config = statusConfig[status];
  
  const sizes: Record<string, { padding: string; fontSize: string; iconSize: number }> = {
    sm: { padding: "2px 8px", fontSize: "11px", iconSize: 12 },
    md: { padding: "4px 12px", fontSize: "12px", iconSize: 14 },
    lg: { padding: "6px 16px", fontSize: "14px", iconSize: 18 },
  };

  const styles: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: sizes[size].padding,
    fontSize: sizes[size].fontSize,
    fontWeight: 500,
    borderRadius: "999px",
    color: config.color,
    background: config.bg,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const isAnimated = status === "processing";

  return (
    <span style={styles} className={className}>
      {showIcon && (
        <Icon 
          name={config.icon} 
          size={sizes[size].iconSize} 
          className={isAnimated ? "animate-spin" : ""}
        />
      )}
      {label || config.label}
    </span>
  );
}

// Accent stripe for activity feed items
export function StatusAccent({ 
  status, 
  height = "100%" 
}: { 
  status: Status; 
  height?: string;
}) {
  const config = statusConfig[status];
  
  return (
    <div
      style={{
        width: "3px",
        height,
        background: config.color,
        borderRadius: "999px",
        flexShrink: 0,
      }}
    />
  );
}
