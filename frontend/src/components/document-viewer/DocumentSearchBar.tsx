/**
 * DocumentSearchBar — In-document text search with match navigation
 * Follows Kinetic Observatory design (no borders, gradient accents)
 */
"use client";

import { useState, useCallback, useEffect, KeyboardEvent } from "react";
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

  // Debounced search
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

  return (
    <div
      className="flex items-center gap-3 px-4 py-2"
      style={{
        background: "rgba(19, 28, 43, 0.9)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Search Input */}
      <div
        className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg transition-all"
        style={{
          background: focused
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(255, 255, 255, 0.04)",
          boxShadow: focused
            ? "inset 0 0 0 1px rgba(216, 185, 255, 0.3)"
            : "none",
        }}
      >
        <Icon
          name="search"
          size={18}
          className={focused ? "text-primary" : "text-slate-500"}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-500"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <Icon name="close" size={16} className="text-slate-400" />
          </button>
        )}
      </div>

      {/* Match Counter & Navigation */}
      {query && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 min-w-[80px] text-center">
            {matchCount > 0 ? (
              <>
                <span className="text-primary">{currentMatch}</span> of{" "}
                {matchCount}
              </>
            ) : (
              "No matches"
            )}
          </span>

          <div className="flex items-center gap-1">
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
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
          <kbd className="px-1.5 py-0.5 rounded bg-white/5">Enter</kbd>
          <span>next</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5">Shift+Enter</kbd>
          <span>prev</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5">Esc</kbd>
          <span>clear</span>
        </div>
      )}
    </div>
  );
}
