/**
 * WelcomeHero — Dynamic welcome state with suggested queries from document corpus
 * Kinetic Observatory design aligned with Command Center dashboard
 */
"use client";

import { useState, useEffect, CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Icon } from "@/components/ui/icon";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";

interface WelcomeHeroProps {
  onSuggestionClick: (query: string) => void;
  docFilter?: string;
}

interface DocumentSummary {
  id: string;
  filename: string;
  doc_type?: string;
  created_at: string;
}

// Generate dynamic suggestions based on document corpus
function generateSuggestions(documents: DocumentSummary[]): string[] {
  if (documents.length === 0) {
    return [
      "What documents are in my corpus?",
      "Help me get started",
      "What can I ask about?",
      "Show me an example query",
    ];
  }

  const suggestions: string[] = [];
  const recentDocs = documents.slice(0, 3);

  // Suggestion based on recent document
  if (recentDocs.length > 0) {
    const recent = recentDocs[0];
    const name = recent.filename.replace(/\.[^/.]+$/, "");
    suggestions.push(`Summarize "${name.slice(0, 30)}${name.length > 30 ? "..." : ""}"`);
  }

  // General suggestions
  suggestions.push("What are the key findings?");
  suggestions.push("Compare the most recent documents");

  if (documents.length > 5) {
    suggestions.push(`Search across all ${documents.length} documents`);
  } else {
    suggestions.push("What topics are covered?");
  }

  return suggestions.slice(0, 4);
}

export function WelcomeHero({ onSuggestionClick, docFilter }: WelcomeHeroProps) {
  const [suggestions, setSuggestions] = useState<string[]>([
    "What documents are in my corpus?",
    "Help me get started",
    "What can I ask about?",
    "Show me an example query",
  ]);

  const { data: documentsData } = useQuery({
    queryKey: ["documents-for-suggestions", docFilter],
    queryFn: () => apiClient.get<{ documents: DocumentSummary[] }>(
      docFilter ? `documents?limit=10&doc_id=${docFilter}` : "documents?limit=10"
    ),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const docs = documentsData?.documents || [];
    setSuggestions(generateSuggestions(docs));
  }, [documentsData]);

  // Styles
  const containerStyles: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
    padding: "32px 24px",
    background: "radial-gradient(ellipse at center, hsl(262 80% 65% / 0.03) 0%, transparent 70%)",
  };

  const iconContainerStyles: CSSProperties = {
    position: "relative",
    width: 100,
    height: 100,
    marginBottom: 32,
  };

  const iconGlowStyles: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: 24,
    filter: "blur(20px)",
    opacity: 0.4,
    background: "linear-gradient(135deg, hsl(262, 80%, 65%), hsl(200, 90%, 65%))",
  };

  const iconBoxStyles: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 24,
    background: "linear-gradient(135deg, hsl(262, 80%, 65%), hsl(200, 90%, 65%))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const titleStyles: CSSProperties = {
    fontSize: "2.5rem",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    marginBottom: 12,
    fontFamily: "var(--font-space-grotesk), sans-serif",
    background: "linear-gradient(135deg, hsl(210, 40%, 98%) 0%, hsl(215, 20%, 75%) 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  };

  const subtitleStyles: CSSProperties = {
    fontSize: 15,
    color: "hsl(215, 20%, 55%)",
    maxWidth: 400,
    marginBottom: 40,
    lineHeight: 1.6,
  };

  const suggestionsContainerStyles: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    maxWidth: 520,
  };

  const suggestionButtonStyles: CSSProperties = {
    padding: "12px 18px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 500,
    background: "rgba(255, 255, 255, 0.04)",
    color: "hsl(215, 20%, 75%)",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const kbdStyles: CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.06)",
    fontSize: 12,
    fontWeight: 500,
    color: "hsl(215, 20%, 55%)",
  };

  const icons = ["auto_awesome", "lightbulb", "compare", "search"];

  return (
    <div style={containerStyles}>
      {/* Gradient Icon Container */}
      <div style={iconContainerStyles}>
        <div style={iconGlowStyles} />
        <div style={iconBoxStyles}>
          <Icon name="psychology" size={48} style={{ color: "hsl(210, 40%, 98%)" }} />
        </div>
      </div>

      {/* Hero Typography */}
      <h1 style={titleStyles}>
        Intelligence Terminal
      </h1>

      <p style={subtitleStyles}>
        Ask anything about your documents. I'll search through your corpus and
        provide answers with source citations.
      </p>

      {/* Dynamic Suggestion Chips */}
      <div style={suggestionsContainerStyles}>
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => onSuggestionClick(suggestion)}
            style={suggestionButtonStyles}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <Icon
              name={icons[idx]}
              size={18}
              style={{ color: "hsl(262, 80%, 70%)" }}
            />
            {suggestion}
          </button>
        ))}
      </div>

      {/* Keyboard Hint */}
      <div 
        className="flex items-center gap-2" 
        style={{ marginTop: 48 }}
      >
        <kbd style={kbdStyles}>⌘</kbd>
        <span style={{ fontSize: 12, color: "hsl(215, 20%, 45%)" }}>+</span>
        <kbd style={kbdStyles}>Enter</kbd>
        <span style={{ fontSize: 12, color: "hsl(215, 20%, 45%)", marginLeft: 8 }}>to send</span>
      </div>
    </div>
  );
}
