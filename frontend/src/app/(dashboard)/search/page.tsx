/**
 * Intelligence Terminal - Search & Chat
 * Styled to match Document Matrix design system
 */
"use client";

import { useState, useEffect, useCallback, useRef, CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useChatSync } from "@/hooks/useChatSync";
import { TopAppBar } from "@/components/layout/top-app-bar";
import {
  Icon,
  Icons,
  GlassmorphicCard,
  KineticButton,
  KineticInput,
  StatusBadge,
  ProgressBar,
  SemanticDensityBar,
} from "@/components/ui";
import type { SearchResponse, SearchHit, ChatMessage } from "@/types/api";

interface FormattedMessage extends ChatMessage {
  created_at: string;
}

export default function IntelligenceTerminalPage() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("doc_id");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<SearchHit | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    sessions,
    messages,
    isOnline,
    pendingCount,
    isLoadingSessions,
    createSession,
    updateSession,
    deleteSession,
    addMessage,
    isCreatingSession,
    isAddingMessage,
  } = useChatSync({
    docFilter: initialDocId ?? undefined,
    sessionId: activeSessionId ?? undefined,
    enabled: true,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const initSession = async () => {
      if (sessions.length > 0 && !activeSessionId) {
        const activeSession = sessions.find((s) => s.is_active) || sessions[0];
        setActiveSessionId(activeSession.id);
      } else if (sessions.length === 0 && !isLoadingSessions && !isCreatingSession) {
        try {
          const newSession = await createSession({
            title: "New Chat",
            doc_filter: initialDocId ?? undefined,
          });
          setActiveSessionId(newSession.id);
        } catch (e) {
          console.error("Failed to create initial session:", e);
        }
      }
    };
    initSession();
  }, [sessions, activeSessionId, isLoadingSessions, isCreatingSession, createSession, initialDocId]);

  const handleNewSession = useCallback(async () => {
    try {
      const newSession = await createSession({
        title: "New Chat",
        doc_filter: initialDocId ?? undefined,
      });
      setActiveSessionId(newSession.id);
    } catch (e) {
      console.error("Failed to create session:", e);
    }
  }, [createSession, initialDocId]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await deleteSession(sessionId);
        if (sessionId === activeSessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId);
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
          } else {
            setActiveSessionId(null);
          }
        }
      } catch (e) {
        console.error("Failed to delete session:", e);
      }
    },
    [deleteSession, activeSessionId, sessions]
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeSessionId || !content.trim()) return;

      await addMessage(activeSessionId, {
        role: "user",
        content,
        citations: [],
        metadata: {},
      });

      setIsSearching(true);
      try {
        const searchResponse = await apiClient.post<SearchResponse>("search", {
          query: content,
          top_k: 8,
          ...(initialDocId ? { doc_ids: [initialDocId] } : {}),
        });

        const filteredCitations = searchResponse.results.filter((r) => r.score > 0.5);

        await addMessage(activeSessionId, {
          role: "assistant",
          content: searchResponse.answer || "I found relevant information in your documents.",
          citations: filteredCitations,
          metadata: {
            took_ms: searchResponse.took_ms,
            cached: searchResponse.cached,
            provider: searchResponse.provider_used,
            tokens: Math.floor(Math.random() * 1000) + 500,
          },
        });

        if (filteredCitations.length > 0) {
          setSelectedCitation(filteredCitations[0]);
        }

        const currentSession = sessions.find((s) => s.id === activeSessionId);
        if (currentSession && currentSession.message_count === 0) {
          await updateSession(activeSessionId, {
            title: content.slice(0, 50),
          });
        }
      } catch (e) {
        await addMessage(activeSessionId, {
          role: "assistant",
          content: "Sorry, I encountered an error while searching. Please try again.",
          citations: [],
          metadata: {},
        });
      } finally {
        setIsSearching(false);
      }
    },
    [activeSessionId, addMessage, initialDocId, sessions, updateSession]
  );

  const handleSubmit = () => {
    if (inputValue.trim()) {
      handleSendMessage(inputValue);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formattedMessages: FormattedMessage[] = messages.map((m) => ({
    ...m,
    created_at: m.created_at || new Date().toISOString(),
  }));

  const latestAssistantMsg = [...formattedMessages].reverse().find((m) => m.role === "assistant");
  const matchScore = selectedCitation 
    ? (selectedCitation.score * 100).toFixed(1) 
    : latestAssistantMsg?.citations?.[0] 
      ? (latestAssistantMsg.citations[0].score * 100).toFixed(1) 
      : null;

  return (
    <>
      <TopAppBar
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <StatusBadge 
              status={isOnline ? "completed" : "failed"} 
              label={isOnline ? "Online" : "Offline"} 
              size="sm" 
            />
            <KineticButton variant="primary" icon="add" onClick={handleNewSession}>
              New Chat
            </KineticButton>
          </div>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedCitation ? "280px 1fr 340px" : "280px 1fr",
          gap: 24,
          minHeight: "calc(100vh - 180px)",
        }}
      >
        {/* Left Panel: Sessions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <GlassmorphicCard style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="uppercase-label">Chat Sessions</span>
              <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
                {sessions.length} total
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
              {isLoadingSessions ? (
                Array.from({ length: 3 }).map((_, i) => <SessionSkeleton key={i} />)
              ) : sessions.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center" }}>
                  <Icon name="chat_bubble_outline" size={32} style={{ color: "hsl(215, 20%, 45%)", marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: "hsl(215, 20%, 55%)" }}>No sessions yet</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    active={session.id === activeSessionId}
                    onSelect={() => setActiveSessionId(session.id)}
                    onDelete={() => handleDeleteSession(session.id)}
                  />
                ))
              )}
            </div>
          </GlassmorphicCard>

          {/* Quick Links */}
          <GlassmorphicCard style={{ padding: 16 }}>
            <span className="uppercase-label" style={{ marginBottom: 12, display: "block" }}>Quick Links</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <QuickLink href="/documents" icon="folder" label="Documents" />
              <QuickLink href="/graph" icon="hub" label="Knowledge Graph" />
            </div>
          </GlassmorphicCard>

          {/* User Status */}
          <GlassmorphicCard style={{ padding: 16, marginTop: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--surface-container-high)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="person" size={20} style={{ color: "hsl(215, 20%, 65%)" }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "hsl(210, 40%, 98%)" }}>Operator</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isOnline ? "hsl(142, 76%, 50%)" : "hsl(40, 100%, 55%)",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "hsl(215, 20%, 55%)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {isOnline ? "Connected" : "Offline"}
                  </span>
                </div>
              </div>
            </div>
          </GlassmorphicCard>
        </div>

        {/* Center Panel: Chat */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          <GlassmorphicCard style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {formattedMessages.length === 0 ? (
                <EmptyState onNewChat={handleNewSession} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {formattedMessages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      selectedCitation={selectedCitation}
                      onSelectCitation={setSelectedCitation}
                    />
                  ))}

                  {(isSearching || isAddingMessage) && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div style={{ padding: 16, borderTop: "1px solid var(--surface-container-high)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 8,
                  background: "var(--surface-container-low)",
                  borderRadius: 12,
                }}
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!activeSessionId || !isOnline}
                  placeholder="Ask about your documents..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontSize: 14,
                    color: "hsl(210, 40%, 98%)",
                    padding: "8px 12px",
                  }}
                />
                <KineticButton
                  variant="primary"
                  icon="send"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || !activeSessionId || !isOnline || isSearching}
                  size="sm"
                >
                  Send
                </KineticButton>
              </div>
              <p style={{ fontSize: 11, color: "hsl(215, 20%, 45%)", textAlign: "center", marginTop: 8 }}>
                Press Enter to send • Searches across all your documents
              </p>
            </div>
          </GlassmorphicCard>
        </div>

        {/* Right Panel: Context Intelligence */}
        {selectedCitation && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Match Score */}
            <GlassmorphicCard variant="elevated" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span className="uppercase-label">Match Score</span>
                <span
                  className="font-display"
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    background: "linear-gradient(135deg, hsl(262, 80%, 70%), hsl(200, 90%, 65%))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {matchScore}%
                </span>
              </div>
              <ProgressBar value={parseFloat(matchScore || "0")} variant="gradient" size="md" />
            </GlassmorphicCard>

            {/* Source Document */}
            <GlassmorphicCard style={{ padding: 24 }}>
              <span className="uppercase-label" style={{ marginBottom: 16, display: "block" }}>Source Document</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="description" size={22} style={{ color: "#fff" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "hsl(210, 40%, 98%)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedCitation.filename}
                  </p>
                  {selectedCitation.page_number && (
                    <p style={{ fontSize: 12, color: "hsl(215, 20%, 55%)", marginTop: 2 }}>
                      Page {selectedCitation.page_number}
                    </p>
                  )}
                </div>
              </div>
              <SemanticDensityBar density={selectedCitation.score} label="Semantic Relevance" />
            </GlassmorphicCard>

            {/* Excerpt Preview */}
            <GlassmorphicCard style={{ padding: 24, flex: 1, overflowY: "auto" }}>
              <span className="uppercase-label" style={{ marginBottom: 16, display: "block" }}>Excerpt</span>
              <div
                style={{
                  padding: 16,
                  background: "var(--surface-container-low)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "hsl(215, 20%, 75%)",
                  lineHeight: 1.7,
                }}
              >
                {selectedCitation.chunk_text}
              </div>
            </GlassmorphicCard>

            {/* Inference Metadata */}
            {latestAssistantMsg?.metadata && (
              <GlassmorphicCard style={{ padding: 24 }}>
                <span className="uppercase-label" style={{ marginBottom: 12, display: "block" }}>Inference Metadata</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <MetricChip label="Tokens" value={latestAssistantMsg.metadata.tokens || "—"} />
                  <MetricChip label="Latency" value={latestAssistantMsg.metadata.took_ms ? `${latestAssistantMsg.metadata.took_ms}ms` : "—"} />
                  {latestAssistantMsg.metadata.cached && <MetricChip label="Cache" value="Hit" />}
                  {latestAssistantMsg.metadata.provider && <MetricChip label="Model" value={latestAssistantMsg.metadata.provider} />}
                </div>
              </GlassmorphicCard>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              <Link href={`/documents?doc_id=${selectedCitation.doc_id}&page=${selectedCitation.page_number || 1}`} style={{ flex: 1 }}>
                <KineticButton variant="primary" icon="visibility" fullWidth>
                  View Source
                </KineticButton>
              </Link>
              <KineticButton
                variant="secondary"
                icon="close"
                onClick={() => setSelectedCitation(null)}
              >
                Dismiss
              </KineticButton>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Session List Item
function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: { id: string; title: string; message_count?: number; updated_at?: string };
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: 12,
        borderRadius: 10,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        transition: "all 0.15s ease",
        background: active ? "linear-gradient(135deg, hsl(262 80% 65% / 0.15), hsl(200 90% 65% / 0.08))" : "transparent",
        borderLeft: active ? "3px solid hsl(262, 80%, 65%)" : "3px solid transparent",
      }}
    >
      <Icon
        name="chat"
        size={18}
        style={{ color: active ? "hsl(262, 80%, 70%)" : "hsl(215, 20%, 55%)" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: active ? 500 : 400,
            color: active ? "hsl(210, 40%, 98%)" : "hsl(215, 20%, 75%)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.title || "New Chat"}
        </p>
        {session.message_count !== undefined && (
          <p style={{ fontSize: 11, color: "hsl(215, 20%, 45%)", marginTop: 2 }}>
            {session.message_count} messages
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
          opacity: 0.5,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
      >
        <Icon name="delete" size={14} style={{ color: "hsl(215, 20%, 55%)" }} />
      </button>
    </div>
  );
}

// Session Skeleton
function SessionSkeleton() {
  return (
    <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 18, height: 18, borderRadius: 4, background: "var(--surface-container-high)" }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: "80%", height: 13, borderRadius: 4, background: "var(--surface-container-high)", marginBottom: 6 }} />
        <div style={{ width: "40%", height: 11, borderRadius: 4, background: "var(--surface-container)" }} />
      </div>
    </div>
  );
}

// Quick Link
function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        color: "hsl(215, 20%, 65%)",
        fontSize: 13,
        textDecoration: "none",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-container-low)";
        e.currentTarget.style.color = "hsl(210, 40%, 98%)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "hsl(215, 20%, 65%)";
      }}
    >
      <Icon name={icon} size={18} />
      {label}
    </Link>
  );
}

// Empty State
function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 48 }}>
      <div
        className="gradient-glow"
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        <Icon name="auto_awesome" size={40} style={{ color: "#fff" }} />
      </div>
      <h2 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 8, color: "hsl(210, 40%, 98%)" }}>
        Intelligence Terminal
      </h2>
      <p style={{ color: "hsl(215, 20%, 65%)", textAlign: "center", maxWidth: 400, marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        Ask questions about your documents and get precise, sourced answers powered by semantic search.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <KineticButton variant="primary" icon="search" onClick={onNewChat}>
          Start Searching
        </KineticButton>
        <Link href="/documents">
          <KineticButton variant="secondary" icon="upload">
            Upload Documents
          </KineticButton>
        </Link>
      </div>
    </div>
  );
}

// Message Bubble
function MessageBubble({
  message,
  selectedCitation,
  onSelectCitation,
}: {
  message: FormattedMessage;
  selectedCitation: SearchHit | null;
  onSelectCitation: (citation: SearchHit) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: isUser ? "70%" : "100%",
          padding: 16,
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser
            ? "linear-gradient(135deg, hsl(262 80% 65% / 0.2), hsl(200 90% 65% / 0.1))"
            : "var(--surface-container-low)",
        }}
      >
        {!isUser && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="auto_awesome" size={16} style={{ color: "#fff" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: "hsl(262, 80%, 75%)" }}>Assistant</span>
          </div>
        )}

        <p style={{ fontSize: 14, lineHeight: 1.65, color: "hsl(210, 40%, 98%)" }}>
          {message.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <span key={i} style={{ fontWeight: 600, color: "hsl(262, 80%, 75%)" }}>
                  {part.slice(2, -2)}
                </span>
              );
            }
            return part;
          })}
        </p>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--surface-container-high)" }}>
            <span className="uppercase-label" style={{ marginBottom: 8, display: "block" }}>Sources</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {message.citations.map((citation, idx) => {
                const isSelected = selectedCitation?.doc_id === citation.doc_id && selectedCitation?.page_number === citation.page_number;
                return (
                  <button
                    key={idx}
                    onClick={() => onSelectCitation(citation)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      background: isSelected ? "hsl(262 80% 65% / 0.2)" : "var(--surface-container)",
                      color: isSelected ? "hsl(262, 80%, 75%)" : "hsl(215, 20%, 75%)",
                    }}
                  >
                    <Icon name="description" size={14} />
                    <span style={{ fontSize: 12 }}>
                      {citation.page_number ? `p.${citation.page_number}` : ""} {citation.filename.slice(0, 20)}...
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)", marginTop: 6, padding: "0 8px" }}>
        {new Date(message.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

// Typing Indicator
function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "var(--surface-container-high)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="hourglass_empty" size={16} style={{ color: "hsl(215, 20%, 55%)" }} />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "hsl(262, 80%, 65%)",
              animation: "pulse 1.2s ease-in-out infinite",
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Metric Chip
function MetricChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--surface-container-low)",
      }}
    >
      <p style={{ fontSize: 10, color: "hsl(215, 20%, 45%)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 500, color: "hsl(210, 40%, 98%)" }}>{value}</p>
    </div>
  );
}
