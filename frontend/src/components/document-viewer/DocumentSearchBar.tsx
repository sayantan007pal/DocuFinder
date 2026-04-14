/**
 * DocumentSearchBar — In-document text search with match navigation
 * Command Center design with bottom accent bar on focus
 */
"use client";

import { useState, useCallback, useEffect, KeyboardEvent, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";

interface DocumentSearchBarProps {
  onSearch: (query: string) => void;
  matchCount?: number;
  currentMatch?: number;
  onNextMatch?: () => void;
  onPrevMatch?: () => void;
  placeholder?: string;
}

export function DocumentSearchBar({
  onSearch,
  matchCount = 0,
  currentMatch = 0,
  onNextMatch,
  onPrevMatch,
  placeholder = "Search in document...",
}: DocumentSearchBarProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          onPrevMatch?.();
        } else {
          onNextMatch?.();
        }
      }
      if (e.key === "Escape") {
        setQuery("");
      }
    },
    [onNextMatch, onPrevMatch]
  );

  const clearSearch = () => {
    setQuery("");
    onSearch("");
  };

  const containerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 20px",
    background: "var(--surface-container-low)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
  };

  const inputWrapperStyles: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    transition: "all 0.15s ease",
    background: focused ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.03)",
  };

  const accentBarStyles: CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    height: 2,
    borderRadius: 1,
    transition: "all 0.2s ease",
    width: focused ? "80%" : "0%",
    background: "linear-gradient(90deg, hsl(262, 80%, 70%), hsl(200, 90%, 65%))",
    opacity: focused ? 1 : 0,
  };

  const inputStyles: CSSProperties = {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    fontSize: 14,
    color: "hsl(210, 40%, 98%)",
  };

  const clearButtonStyles: CSSProperties = {
    padding: 4,
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    transition: "all 0.15s ease",
  };

  const matchCounterStyles: CSSProperties = {
    fontSize: 13,
    color: "hsl(215, 20%, 55%)",
    minWidth: 85,
    textAlign: "center",
  };

  const kbdStyles: CSSProperties = {
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    background: "rgba(255, 255, 255, 0.06)",
    color: "hsl(215, 20%, 55%)",
    fontFamily: "inherit",
    border: "none",
  };

  const hintTextStyles: CSSProperties = {
    fontSize: 11,
    color: "hsl(215, 20%, 45%)",
  };

  return (
    <div style={containerStyles}>
      {/* Search Input */}
      <div style={inputWrapperStyles}>
        <Icon
          name="search"
          size={18}
          style={{ 
            color: focused ? "hsl(262, 80%, 70%)" : "hsl(215, 20%, 45%)",
            transition: "color 0.15s ease",
            flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={inputStyles}
        />
        {query && (
          <button
            onClick={clearSearch}
            style={clearButtonStyles}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <Icon name="close" size={16} style={{ color: "hsl(215, 20%, 55%)" }} />
          </button>
        )}
        {/* Bottom accent bar */}
        <div style={accentBarStyles} />
      </div>

      {/* Match Counter & Navigation */}
      {query && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={matchCounterStyles}>
            {matchCount > 0 ? (
              <>
                <span style={{ color: "hsl(262, 80%, 70%)", fontWeight: 600 }}>{currentMatch}</span>
                {" of "}
                {matchCount}
              </>
            ) : (
              "No matches"
            )}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <KineticButton
              variant="ghost"
              size="sm"
              icon="keyboard_arrow_up"
              onClick={onPrevMatch}
              disabled={matchCount === 0}
            >
              Prev
            </KineticButton>
            <KineticButton
              variant="ghost"
              size="sm"
              icon="keyboard_arrow_down"
              onClick={onNextMatch}
              disabled={matchCount === 0}
            >
              Next
            </KineticButton>
          </div>
        </div>
      )}

      {/* Keyboard Hints */}
      {focused && (
        <div style={{ display: "none", alignItems: "center", gap: 8 }} className="md:flex!">
          <kbd style={kbdStyles}>Enter</kbd>
          <span style={hintTextStyles}>next</span>
          <kbd style={kbdStyles}>⇧ Enter</kbd>
          <span style={hintTextStyles}>prev</span>
          <kbd style={kbdStyles}>Esc</kbd>
          <span style={hintTextStyles}>clear</span>
        </div>
      )}
    </div>
  );
}
