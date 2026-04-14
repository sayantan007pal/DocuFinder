/**
 * TypingIndicator — Animated dots for assistant typing state
 * Kinetic Observatory: gradient-tinted animation
 */
"use client";

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <div
        className="w-2 h-2 rounded-full animate-bounce"
        style={{
          background: "hsl(262, 80%, 65%)",
          animationDelay: "0ms",
          animationDuration: "600ms",
        }}
      />
      <div
        className="w-2 h-2 rounded-full animate-bounce"
        style={{
          background: "hsl(230, 85%, 65%)",
          animationDelay: "150ms",
          animationDuration: "600ms",
        }}
      />
      <div
        className="w-2 h-2 rounded-full animate-bounce"
        style={{
          background: "hsl(200, 90%, 65%)",
          animationDelay: "300ms",
          animationDuration: "600ms",
        }}
      />
    </div>
  );
}
