/**
 * GlassmorphicCard - Floating card with backdrop blur
 * Follows Command Center design system (no 1px borders)
 */

import { ReactNode, CSSProperties, MouseEvent } from "react";

interface GlassmorphicCardProps {
  children: ReactNode;
  variant?: "default" | "elevated" | "panel";
  className?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  hoverable?: boolean;
}

export function GlassmorphicCard({
  children,
  variant = "default",
  className = "",
  style,
  onClick,
  hoverable = false,
}: GlassmorphicCardProps) {
  const baseStyles: CSSProperties = {
    borderRadius: "12px",
    transition: "all 0.2s ease",
    ...(hoverable && {
      cursor: "pointer",
    }),
  };

  const variantStyles: Record<string, CSSProperties> = {
    default: {
      background: "rgba(255, 255, 255, 0.04)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    },
    elevated: {
      background: "rgba(255, 255, 255, 0.06)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
    },
    panel: {
      background: "rgba(19, 28, 43, 0.8)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    },
  };

  const hoverClass = hoverable 
    ? "hover:bg-white/[0.08] hover:scale-[1.02]" 
    : "";

  return (
    <div
      className={`${hoverClass} ${className}`}
      style={{
        ...baseStyles,
        ...variantStyles[variant],
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
