/**
 * ChatMessageList — Scrollable message list with citations
 * Kinetic Observatory design aligned with Command Center dashboard
 */
"use client";

import { useEffect, useRef, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ChatMessage, SearchHit } from "@/types/api";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onCitationClick?: (citation: SearchHit) => void;
}

export function ChatMessageList({
  messages,
  isLoading,
  onCitationClick,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Format timestamp
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div 
        className="flex flex-col items-center justify-center h-full text-center" 
        style={{ padding: 32 }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "linear-gradient(135deg, hsl(262 80% 65% / 0.15), hsl(200 90% 65% / 0.1))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <Icon name="chat" size={40} style={{ color: "hsl(262, 80%, 60%)" }} />
        </div>
        <h3 
          style={{ 
            fontSize: 18, 
            fontWeight: 600, 
            color: "hsl(210, 40%, 90%)",
            fontFamily: "var(--font-space-grotesk), sans-serif",
            marginBottom: 8,
          }}
        >
          Start a conversation
        </h3>
        <p style={{ fontSize: 14, color: "hsl(215, 20%, 55%)", maxWidth: 300, lineHeight: 1.5 }}>
          Ask questions about your documents. I'll search through them and provide
          answers with source citations.
        </p>
      </div>
    );
  }

  // Container styles
  const containerStyles: CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 20,
    background: "linear-gradient(180deg, var(--surface-base) 0%, var(--surface-container-low) 100%)",
  };

  // User message bubble styles
  const userBubbleStyles: CSSProperties = {
    padding: "14px 18px",
    borderRadius: "16px 16px 4px 16px",
    background: "linear-gradient(135deg, hsl(262 80% 65% / 0.25), hsl(200 90% 65% / 0.15))",
    boxShadow: "inset 0 0 0 1px hsl(262 80% 65% / 0.2)",
  };

  // Assistant message bubble styles
  const assistantBubbleStyles: CSSProperties = {
    padding: "14px 18px",
    borderRadius: "16px 16px 16px 4px",
    background: "rgba(255, 255, 255, 0.04)",
    boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
  };

  // Avatar styles
  const userAvatarStyles: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "linear-gradient(135deg, hsl(262, 80%, 65%), hsl(200, 90%, 65%))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  const assistantAvatarStyles: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "var(--surface-container-high)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  // Citation button styles
  const citationButtonStyles: CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255, 255, 255, 0.03)",
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };

  return (
    <div ref={containerRef} style={containerStyles}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div style={{ maxWidth: "85%" }}>
            <div
              className={`flex items-end gap-3 ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div style={message.role === "user" ? userAvatarStyles : assistantAvatarStyles}>
                <Icon
                  name={message.role === "user" ? "person" : "smart_toy"}
                  size={20}
                  style={{ color: "hsl(210, 40%, 98%)" }}
                />
              </div>

              {/* Message Bubble */}
              <div style={message.role === "user" ? userBubbleStyles : assistantBubbleStyles}>
                {/* Message Content */}
                <p 
                  style={{ 
                    fontSize: 14, 
                    color: "hsl(210, 40%, 92%)", 
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {message.content}
                </p>

                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                  <div 
                    style={{ 
                      marginTop: 14, 
                      paddingTop: 14, 
                      borderTop: "1px solid rgba(255, 255, 255, 0.08)" 
                    }}
                  >
                    <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                      <Icon name="format_quote" size={14} style={{ color: "hsl(215, 20%, 55%)" }} />
                      <span 
                        style={{ 
                          fontSize: 11, 
                          fontWeight: 600, 
                          textTransform: "uppercase", 
                          letterSpacing: "0.1em",
                          color: "hsl(215, 20%, 55%)",
                        }}
                      >
                        Sources
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {message.citations.slice(0, 3).map((citation, idx) => (
                        <button
                          key={idx}
                          onClick={() => onCitationClick?.(citation)}
                          style={citationButtonStyles}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              name="description"
                              size={16}
                              style={{ color: "hsl(200, 90%, 65%)", flexShrink: 0 }}
                            />
                            <span 
                              className="truncate flex-1" 
                              style={{ fontSize: 13, color: "hsl(200, 90%, 65%)" }}
                            >
                              {citation.filename}
                            </span>
                            {citation.page_number && (
                              <span 
                                style={{ 
                                  fontSize: 11, 
                                  color: "hsl(215, 20%, 55%)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(255, 255, 255, 0.04)",
                                }}
                              >
                                p.{citation.page_number}
                              </span>
                            )}
                          </div>
                          <p 
                            className="line-clamp-2" 
                            style={{ 
                              fontSize: 12, 
                              color: "hsl(215, 20%, 65%)", 
                              marginTop: 6,
                              lineHeight: 1.4,
                            }}
                          >
                            {citation.chunk_text}
                          </p>
                        </button>
                      ))}
                      {message.citations.length > 3 && (
                        <p 
                          style={{ 
                            fontSize: 12, 
                            color: "hsl(215, 20%, 55%)", 
                            textAlign: "center",
                            padding: "4px 0",
                          }}
                        >
                          +{message.citations.length - 3} more sources
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div
                  className={`flex items-center gap-2 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                  style={{ marginTop: 10 }}
                >
                  <span style={{ fontSize: 11, color: "hsl(215, 20%, 50%)" }}>
                    {formatTime(message.created_at)}
                  </span>
                  {message.metadata?.took_ms && (
                    <>
                      <span style={{ fontSize: 11, color: "hsl(215, 20%, 40%)" }}>•</span>
                      <span style={{ fontSize: 11, color: "hsl(215, 20%, 50%)" }}>
                        {message.metadata.took_ms}ms
                      </span>
                    </>
                  )}
                  {message.metadata?.cached && (
                    <>
                      <span style={{ fontSize: 11, color: "hsl(215, 20%, 40%)" }}>•</span>
                      <div className="flex items-center gap-1">
                        <Icon name="bolt" size={12} style={{ color: "hsl(38, 92%, 50%)" }} />
                        <span style={{ fontSize: 11, color: "hsl(38, 92%, 50%)" }}>cached</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-start">
          <div className="flex items-end gap-3">
            <div style={assistantAvatarStyles}>
              <Icon name="smart_toy" size={20} style={{ color: "hsl(210, 40%, 98%)" }} />
            </div>
            <div style={assistantBubbleStyles}>
              <div className="flex items-center gap-2">
                <div 
                  className="animate-bounce" 
                  style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: "50%", 
                    background: "hsl(262, 80%, 65%)",
                    animationDelay: "0ms",
                  }} 
                />
                <div 
                  className="animate-bounce" 
                  style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: "50%", 
                    background: "hsl(230, 85%, 65%)",
                    animationDelay: "150ms",
                  }} 
                />
                <div 
                  className="animate-bounce" 
                  style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: "50%", 
                    background: "hsl(200, 90%, 65%)",
                    animationDelay: "300ms",
                  }} 
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
