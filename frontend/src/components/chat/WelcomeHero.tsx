/**
 * WelcomeHero — Dynamic welcome state with suggested queries from document corpus
 * Kinetic Observatory: Hero typography, gradient icon, atmospheric depth
 */
"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Icon } from "@/components/ui/icon";

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

  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center px-8"
      style={{
        background: "radial-gradient(ellipse at center, rgba(216, 185, 255, 0.03) 0%, transparent 70%)",
      }}
    >
      {/* Gradient Icon Container */}
      <div className="relative mb-8" style={{ width: 96, height: 96 }}>
        <div
          className="absolute inset-0 rounded-3xl blur-xl opacity-40"
          style={{ background: "linear-gradient(135deg, hsl(262, 80%, 65%), hsl(200, 90%, 65%))" }}
        />
        <div
          className="relative w-full h-full rounded-3xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(262, 80%, 65%), hsl(200, 90%, 65%))" }}
        >
          <Icon name="psychology" size={48} className="text-white" />
        </div>
      </div>

      {/* Hero Typography */}
      <h1
        className="font-display text-4xl font-semibold mb-3 tracking-tight"
        style={{
          background: "linear-gradient(135deg, hsl(210, 40%, 98%) 0%, hsl(215, 20%, 75%) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Intelligence Terminal
      </h1>

      <p className="text-base mb-10 max-w-md" style={{ color: "hsl(215, 20%, 55%)" }}>
        Ask anything about your documents. I'll search through your corpus and
        provide answers with source citations.
      </p>

      {/* Dynamic Suggestion Chips */}
      <div className="flex flex-wrap justify-center gap-3 max-w-lg">
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => onSuggestionClick(suggestion)}
            className="group relative px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ background: "rgba(255, 255, 255, 0.04)", color: "hsl(215, 20%, 75%)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <span className="flex items-center gap-2">
              <Icon
                name={idx === 0 ? "auto_awesome" : idx === 1 ? "lightbulb" : idx === 2 ? "compare" : "search"}
                size={16}
                style={{ color: "hsl(262, 80%, 70%)" }}
              />
              {suggestion}
            </span>
          </button>
        ))}
      </div>

      {/* Keyboard Hint */}
      <div className="mt-12 flex items-center gap-2 text-xs" style={{ color: "hsl(215, 20%, 45%)" }}>
        <kbd className="px-2 py-1 rounded" style={{ background: "rgba(255, 255, 255, 0.05)" }}>⌘</kbd>
        <span>+</span>
        <kbd className="px-2 py-1 rounded" style={{ background: "rgba(255, 255, 255, 0.05)" }}>Enter</kbd>
        <span className="ml-2">to send</span>
      </div>
    </div>
  );
}
