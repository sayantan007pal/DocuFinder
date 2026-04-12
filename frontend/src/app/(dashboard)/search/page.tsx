"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { SearchResponse } from "@/types/api";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  if (typeof window !== "undefined") {
    // Simple debounce in client component
  }
  return debouncedValue;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () =>
      apiClient.get<SearchResponse>(
        `search?q=${encodeURIComponent(submitted)}&top_k=8`
      ),
    enabled: submitted.length >= 3,
    staleTime: 5 * 60 * 1000,
  });

  const handleSearch = () => {
    if (query.trim().length >= 3) setSubmitted(query.trim());
  };

  return (
    <div className="animate-slide-in">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Semantic Search
        </h1>
        <p style={{ color: "hsl(215, 20%, 65%)", fontSize: 14 }}>
          Search across all your documents using AI
        </p>
      </div>

      {/* Search input */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <div style={{ flex: 1, position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 18,
              color: "hsl(215, 20%, 55%)",
            }}
          >
            🔍
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="What is the vacation policy? How does procurement work?"
            style={{
              width: "100%",
              padding: "14px 16px 14px 44px",
              borderRadius: 10,
              border: "1px solid hsl(217, 33%, 22%)",
              background: "hsl(222, 47%, 8%)",
              color: "hsl(210, 40%, 98%)",
              fontSize: 15,
              outline: "none",
              fontFamily: "inherit",
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = "hsl(262,80%,65%)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "hsl(217, 33%, 22%)")
            }
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={query.length < 3 || isLoading}
          style={{
            padding: "14px 24px",
            borderRadius: 10,
            border: "none",
            cursor: query.length < 3 ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 600,
            background:
              query.length < 3
                ? "hsl(217, 33%, 17%)"
                : "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
            color: query.length < 3 ? "hsl(215, 20%, 50%)" : "white",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          {isLoading || isFetching ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Results */}
      {data && (
        <div>
          {/* Synthesized Answer */}
          {data.answer && (
            <div
              className="glass"
              style={{
                padding: "24px 28px",
                borderRadius: 14,
                marginBottom: 24,
                borderLeft: "3px solid hsl(262,80%,65%)",
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "hsl(262, 80%, 70%)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 10,
                }}
              >
                AI Answer · {data.took_ms.toFixed(0)}ms
                {data.cached && " · Cached"}
              </p>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: "hsl(210, 40%, 90%)",
                }}
              >
                {data.answer}
              </p>
            </div>
          )}

          {/* Source chunks */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <p style={{ fontSize: 14, color: "hsl(215, 20%, 65%)" }}>
              {data.total} source chunks
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.results.map((hit, i) => (
              <div
                key={`${hit.doc_id}-${i}`}
                className="glass"
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  transition: "all 0.15s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "rgba(255,255,255,0.07)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "rgba(255,255,255,0.04)")
                }
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontSize: 16 }}>📄</span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "hsl(210, 40%, 90%)",
                    }}
                  >
                    {hit.filename}
                  </span>
                  {hit.page_number && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(215, 20%, 65%)",
                        background: "hsl(217, 33%, 17%)",
                        padding: "2px 8px",
                        borderRadius: 20,
                      }}
                    >
                      p.{hit.page_number}
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "hsl(262,80%,70%)",
                      background: "hsl(262 80% 65% / 0.1)",
                      padding: "2px 8px",
                      borderRadius: 20,
                    }}
                  >
                    {(hit.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "hsl(215, 20%, 70%)",
                    lineHeight: 1.6,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {hit.chunk_text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !isLoading && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "hsl(215, 20%, 55%)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <p style={{ fontSize: 15 }}>
            Type a question about your documents and press Enter or Search
          </p>
        </div>
      )}
    </div>
  );
}
