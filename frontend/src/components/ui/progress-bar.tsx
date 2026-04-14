/**
 * ProgressBar - Semantic density/progress indicator
 * Kinetic gradient fill with configurable colors
 */

import { CSSProperties } from "react";

interface ProgressBarProps {
  value: number; // 0-100 or 0-1
  max?: number;
  variant?: "default" | "success" | "warning" | "error" | "gradient";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  variant = "default",
  size = "md",
  showLabel = false,
  label,
  className = "",
}: ProgressBarProps) {
  // Normalize value to percentage
  const percentage = max === 1 ? value * 100 : (value / max) * 100;
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  const heights: Record<string, string> = {
    sm: "4px",
    md: "6px",
    lg: "8px",
  };

  const colors: Record<string, string> = {
    default: "hsl(262, 80%, 70%)",
    success: "hsl(142, 76%, 50%)",
    warning: "hsl(38, 92%, 50%)",
    error: "hsl(0, 84%, 60%)",
    gradient: "linear-gradient(90deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
  };

  const containerStyles: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "100%",
  };

  const trackStyles: CSSProperties = {
    width: "100%",
    height: heights[size],
    background: "var(--surface-container-highest)",
    borderRadius: "999px",
    overflow: "hidden",
  };

  const fillStyles: CSSProperties = {
    width: `${clampedPercentage}%`,
    height: "100%",
    background: colors[variant],
    borderRadius: "999px",
    transition: "width 0.3s ease",
  };

  const labelStyles: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "hsl(215, 20%, 65%)",
  };

  return (
    <div style={containerStyles} className={className}>
      {(showLabel || label) && (
        <div style={labelStyles}>
          <span>{label}</span>
          {showLabel && <span>{clampedPercentage.toFixed(0)}%</span>}
        </div>
      )}
      <div style={trackStyles}>
        <div style={fillStyles} />
      </div>
    </div>
  );
}

// Semantic density variant for document analysis
export function SemanticDensityBar({
  density,
  label = "Semantic Density",
}: {
  density: number; // 0-1
  label?: string;
}) {
  return (
    <ProgressBar
      value={density}
      max={1}
      variant="gradient"
      size="sm"
      showLabel
      label={label}
    />
  );
}
