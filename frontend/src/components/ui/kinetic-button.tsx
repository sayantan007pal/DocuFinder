/**
 * KineticButton - Gradient-filled button with kinetic styling
 * No borders, 0.5rem radius per design system
 */

import { ReactNode, CSSProperties, ButtonHTMLAttributes } from "react";
import { Icon } from "./icon";

interface KineticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: string;
  iconPosition?: "left" | "right";
  loading?: boolean;
  fullWidth?: boolean;
}

export function KineticButton({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  style,
  ...props
}: KineticButtonProps) {
  const baseStyles: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    borderRadius: "8px",
    fontWeight: 500,
    transition: "all 0.2s ease",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.6 : 1,
    border: "none",
    outline: "none",
    width: fullWidth ? "100%" : "auto",
  };

  const sizeStyles: Record<string, CSSProperties> = {
    sm: { padding: "6px 12px", fontSize: "13px" },
    md: { padding: "10px 20px", fontSize: "14px" },
    lg: { padding: "14px 28px", fontSize: "16px" },
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: {
      background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
      color: "#fff",
      boxShadow: "0 4px 16px hsl(262 80% 70% / 0.3)",
    },
    secondary: {
      background: "var(--surface-container-high)",
      color: "hsl(210, 40%, 98%)",
    },
    ghost: {
      background: "transparent",
      color: "hsl(215, 20%, 65%)",
    },
    danger: {
      background: "hsl(0, 84%, 60%)",
      color: "#fff",
    },
  };

  const iconSize = size === "sm" ? 16 : size === "lg" ? 22 : 18;

  return (
    <button
      className={`hover:brightness-110 active:scale-[0.98] ${className}`}
      style={{
        ...baseStyles,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Icon name="sync" size={iconSize} className="animate-spin" />
      ) : (
        <>
          {icon && iconPosition === "left" && <Icon name={icon} size={iconSize} />}
          {children}
          {icon && iconPosition === "right" && <Icon name={icon} size={iconSize} />}
        </>
      )}
    </button>
  );
}
