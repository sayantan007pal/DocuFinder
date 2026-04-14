/**
 * TypingIndicator — Animated dots for assistant typing state
 * Kinetic Observatory design with gradient-tinted animation
 */
"use client";

import { CSSProperties } from "react";

export function TypingIndicator() {
  const containerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
  };

  const dotBaseStyles: CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: "50%",
    animationName: "bounce",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationDuration: "600ms",
  };

  return (
    <div style={containerStyles}>
      <div
        className="animate-bounce"
        style={{
          ...dotBaseStyles,
          background: "hsl(262, 80%, 70%)",
          animationDelay: "0ms",
        }}
      />
      <div
        className="animate-bounce"
        style={{
          ...dotBaseStyles,
          background: "hsl(230, 85%, 65%)",
          animationDelay: "150ms",
        }}
      />
      <div
        className="animate-bounce"
        style={{
          ...dotBaseStyles,
          background: "hsl(200, 90%, 65%)",
          animationDelay: "300ms",
        }}
      />
    </div>
  );
}
