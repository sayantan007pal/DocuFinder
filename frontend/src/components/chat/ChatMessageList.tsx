/**
 * ChatMessageList — Scrollable message list with citations
 * Kinetic Observatory design with differentiated user/assistant bubbles
 */
"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";
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

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
          style={{
            background: "linear-gradient(135deg, rgba(216, 185, 255, 0.1), rgba(116, 209, 255, 0.1))",
          }}
        >
          <Icon name="chat" size={40} className="text-primary/60" />
        </div>
        <h3 className="text-lg font-medium text-slate-300 mb-2">
          Start a conversation
        </h3>
        <p className="text-sm text-slate-500 max-w-xs">
          Ask questions about your documents. I'll search through them and provide
          answers with source citations.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto p-4 space-y-4"
      style={{
        background: "linear-gradient(180deg, rgba(11, 19, 35, 0.5) 0%, rgba(19, 28, 43, 0.5) 100%)",
      }}
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] ${
              message.role === "user" ? "order-2" : "order-1"
            }`}
          >
            {/* Avatar */}
            <div
              className={`flex items-end gap-2 ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === "user"
                    ? "bg-gradient-to-br from-purple-500 to-cyan-500"
                    : "bg-slate-700"
                }`}
              >
                <Icon
                  name={message.role === "user" ? "person" : "smart_toy"}
                  size={18}
                  className="text-white"
                />
              </div>

              {/* Message Bubble */}
              <div
                className={`rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-gradient-to-br from-purple-500/30 to-cyan-500/20 rounded-br-md"
                    : "bg-white/5 rounded-bl-md"
                }`}
                style={
                  message.role === "assistant"
                    ? { boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.05)" }
                    : {}
                }
              >
                {/* Message Content */}
                <p className="text-sm text-slate-200 whitespace-pre-wrap">
                  {message.content}
                </p>

                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                      <Icon name="format_quote" size={12} />
                      Sources
                    </p>
                    <div className="space-y-2">
                      {message.citations.slice(0, 3).map((citation, idx) => (
                        <button
                          key={idx}
                          onClick={() => onCitationClick?.(citation)}
                          className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              name="description"
                              size={14}
                              className="text-cyan-400 shrink-0"
                            />
                            <span className="text-xs text-cyan-400 truncate flex-1">
                              {citation.filename}
                            </span>
                            {citation.page_number && (
                              <span className="text-xs text-slate-500">
                                p.{citation.page_number}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {citation.chunk_text}
                          </p>
                        </button>
                      ))}
                      {message.citations.length > 3 && (
                        <p className="text-xs text-slate-500 text-center">
                          +{message.citations.length - 3} more sources
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div
                  className={`flex items-center gap-2 mt-2 text-xs text-slate-500 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <span>{formatTime(message.created_at)}</span>
                  {message.metadata?.took_ms && (
                    <>
                      <span>•</span>
                      <span>{message.metadata.took_ms}ms</span>
                    </>
                  )}
                  {message.metadata?.cached && (
                    <>
                      <span>•</span>
                      <Icon name="bolt" size={12} className="text-yellow-500" />
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
          <div className="flex items-end gap-2">
            <div className="shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
              <Icon name="smart_toy" size={18} className="text-white" />
            </div>
            <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-white/5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
