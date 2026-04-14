/**
 * MetricCard - Dashboard metric display
 * Glassmorphic styling with kinetic accents
 */

import { CSSProperties, ReactNode } from "react";
import { Icon } from "./icon";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
  };
  icon?: string;
  secondaryValue?: string;
  children?: ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  trend,
  icon,
  secondaryValue,
  children,
  className = "",
}: MetricCardProps) {
  const cardStyles: CSSProperties = {
    background: "rgba(255, 255, 255, 0.04)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: "16px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  const labelStyles: CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "hsl(215, 20%, 65%)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const valueStyles: CSSProperties = {
    fontFamily: "var(--font-space-grotesk), 'Space Grotesk', system-ui, sans-serif",
    fontSize: "2.5rem",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    lineHeight: 1.1,
  };

  const trendColors = {
    up: "hsl(142, 76%, 50%)",
    down: "hsl(0, 84%, 60%)",
    neutral: "hsl(215, 20%, 65%)",
  };

  const trendIcons = {
    up: "trending_up",
    down: "trending_down",
    neutral: "trending_flat",
  };

  return (
    <div style={cardStyles} className={className}>
      <div style={labelStyles}>
        {icon && <Icon name={icon} size={16} />}
        {label}
      </div>
      
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={valueStyles}>{value}</span>
        {unit && (
          <span style={{ fontSize: "14px", color: "hsl(215, 20%, 65%)" }}>
            {unit}
          </span>
        )}
      </div>

      {(trend || secondaryValue) && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {trend && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "13px",
                fontWeight: 500,
                color: trendColors[trend.direction],
              }}
            >
              <Icon name={trendIcons[trend.direction]} size={16} />
              {trend.direction === "up" ? "+" : trend.direction === "down" ? "-" : ""}
              {Math.abs(trend.value)}%
            </span>
          )}
          {secondaryValue && (
            <span style={{ fontSize: "13px", color: "hsl(215, 20%, 65%)" }}>
              {secondaryValue}
            </span>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

// Mini stat for inline display
export function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 12px",
        background: "var(--surface-container-low)",
        borderRadius: "8px",
      }}
    >
      {icon && <Icon name={icon} size={16} style={{ color: "hsl(262, 80%, 70%)" }} />}
      <span style={{ fontSize: "12px", color: "hsl(215, 20%, 65%)" }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: 600, color: "hsl(210, 40%, 98%)" }}>
        {value}
      </span>
    </div>
  );
}
