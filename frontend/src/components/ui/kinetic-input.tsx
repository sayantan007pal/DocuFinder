/**
 * KineticInput - Input with bottom accent (no borders)
 * 2px bottom accent, focus transforms to gradient
 */

import { InputHTMLAttributes, forwardRef, useState, CSSProperties } from "react";
import { Icon } from "./icon";

interface KineticInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: string;
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const KineticInput = forwardRef<HTMLInputElement, KineticInputProps>(
  ({ icon, label, error, fullWidth = false, className = "", style, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false);

    const containerStyles: CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      width: fullWidth ? "100%" : "auto",
    };

    const inputWrapperStyles: CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px 16px",
      background: "var(--surface-container-low)",
      borderRadius: "8px 8px 0 0",
      position: "relative",
    };

    const accentStyles: CSSProperties = {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: "2px",
      background: focused
        ? "linear-gradient(90deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)"
        : error
        ? "hsl(0, 84%, 60%)"
        : "var(--surface-container-highest)",
      transition: "background 0.2s ease",
    };

    const inputStyles: CSSProperties = {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: "hsl(210, 40%, 98%)",
      fontSize: "15px",
      fontFamily: "inherit",
    };

    return (
      <div style={containerStyles} className={className}>
        {label && (
          <label 
            style={{
              fontSize: "12px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: error ? "hsl(0, 84%, 60%)" : "hsl(215, 20%, 65%)",
            }}
          >
            {label}
          </label>
        )}
        <div style={inputWrapperStyles}>
          {icon && (
            <Icon 
              name={icon} 
              size={20} 
              style={{ color: focused ? "hsl(262, 80%, 70%)" : "hsl(215, 20%, 65%)" }} 
            />
          )}
          <input
            ref={ref}
            style={{ ...inputStyles, ...style }}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...props}
          />
          <div style={accentStyles} />
        </div>
        {error && (
          <span style={{ fontSize: "12px", color: "hsl(0, 84%, 60%)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);

KineticInput.displayName = "KineticInput";
