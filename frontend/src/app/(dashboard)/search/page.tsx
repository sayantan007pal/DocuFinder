"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { TopAppBar } from "@/components/layout/top-app-bar";
import { ChatHistorySidebar } from "@/components/chat/ChatHistorySidebar";
import { ChatInput } from "@/components/chat/ChatInput";
import { WelcomeHero } from "@/components/chat/WelcomeHero";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { CitationPreview } from "@/components/chat/CitationPreview";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { ExportDropdown } from "@/components/chat/ExportDropdown";
import { useChatSync } from "@/hooks/useChatSync";
import {
  Icon,
  GlassmorphicCard,
  KineticButton,
} from "@/components/ui";
import type { SearchResponse, SearchHit, ChatMessage } from "@/types/api";
import Link from "next/link";

interface FormattedMessage extends ChatMessage {
  created_at: string;
}

export default function IntelligenceTerminalPage() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("doc_id");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<SearchHit | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const citationPanelOpen = selectedCitation !== null;

  // Use chat sync hook for API-backed sessions
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-select first session or create new one
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

  // Handle new chat session
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

  // Handle session rename
  const handleRenameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      try {
        await updateSession(sessionId, { title: newTitle });
      } catch (e) {
        console.error("Failed to rename session:", e);
      }
    },
    [updateSession]
  );

  // Handle session delete
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

  // Handle sending messages with RAG search
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeSessionId) return;

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
          },
        });

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

  // Handle suggestion click from WelcomeHero
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSendMessage(suggestion);
    },
    [handleSendMessage]
  );

  // Format messages
  const formattedMessages: FormattedMessage[] = messages.map((m) => ({
    ...m,
    created_at: m.created_at || new Date().toISOString(),
  }));

  // Has messages to show
  const hasMessages = formattedMessages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      <TopAppBar
        actions={
          <div className="flex items-center gap-3">
            {!isOnline && (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg" style={{ background: "hsl(45 90% 50% / 0.15)", color: "hsl(45, 90%, 60%)" }}>
                <Icon name="cloud_off" size={14} />
                Offline
              </span>
            )}
            {pendingCount > 0 && (
              <span className="px-2 py-1 text-xs rounded-lg" style={{ background: "hsl(45 90% 50% / 0.15)", color: "hsl(45, 90%, 60%)" }}>
                {pendingCount} pending
              </span>
            )}
            {hasMessages && (
              <ExportDropdown messages={formattedMessages} sessionTitle={sessions.find((s) => s.id === activeSessionId)?.title} />
            )}
            <KineticButton variant="primary" size="sm" icon="add" onClick={handleNewSession} loading={isCreatingSession}>
              New Chat
            </KineticButton>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Chat History Sidebar */}
        <ChatHistorySidebar
          sessions={sessions}
          activeSessionId={activeSessionId ?? undefined}
          onSessionSelect={setActiveSessionId}
          onNewSession={handleNewSession}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          isCreating={isCreatingSession}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          isOnline={isOnline}
          pendingCount={pendingCount}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: "linear-gradient(180deg, rgba(11, 19, 35, 0.98) 0%, rgba(19, 28, 43, 0.98) 100%)" }}>
          {/* Session Header */}
          {activeSessionId && (
            <div className="flex items-center justify-between px-6 py-3" style={{ background: "rgba(255, 255, 255, 0.02)" }}>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Icon name="chat" size={16} style={{ color: "hsl(262, 80%, 70%)" }} />
                  <span className="text-sm font-medium" style={{ color: "hsl(210, 40%, 98%)" }}>
                    {sessions.find((s) => s.id === activeSessionId)?.title || "Chat"}
                  </span>
                </div>
                {initialDocId && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: "hsl(200 90% 65% / 0.1)" }}>
                    <Icon name="filter_alt" size={14} style={{ color: "hsl(200, 90%, 65%)" }} />
                    <span className="text-xs" style={{ color: "hsl(200, 90%, 65%)" }}>
                      Document filter active
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: isOnline ? "hsl(142, 76%, 50%)" : "hsl(45, 90%, 50%)" }} />
                <span className="text-xs" style={{ color: "hsl(215, 20%, 55%)" }}>
                  {isOnline ? "Connected" : "Offline"}
                </span>
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-auto">
            {!hasMessages ? (
              <WelcomeHero onSuggestionClick={handleSuggestionClick} docFilter={initialDocId ?? undefined} />
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
                {formattedMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-5 py-4 ${msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"}`}
                      style={{
                        background: msg.role === "user" ? "hsl(262 80% 65% / 0.15)" : "rgba(255, 255, 255, 0.04)",
                      }}
                    >
                      {msg.role === "assistant" ? (
                        <>
                          <MarkdownRenderer content={msg.content} />
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                              <span className="text-xs uppercase tracking-wider mb-2 block" style={{ color: "hsl(215, 20%, 50%)" }}>
                                Sources
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {msg.citations.map((citation, idx) => (
                                  <CitationPreview
                                    key={idx}
                                    citation={citation}
                                    onClick={() => setSelectedCitation(citation)}
                                  >
                                    <button
                                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all duration-200"
                                      style={{ background: "rgba(255, 255, 255, 0.05)", color: "hsl(200, 90%, 70%)" }}
                                      onMouseOver={(e) => {
                                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                                      }}
                                      onMouseOut={(e) => {
                                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                                      }}
                                    >
                                      <Icon name="description" size={12} />
                                      {citation.filename}
                                      {citation.page_number && ` (p.${citation.page_number})`}
                                    </button>
                                  </CitationPreview>
                                ))}
                              </div>
                            </div>
                          )}
                          {msg.metadata?.took_ms && (
                            <div className="mt-3 text-xs" style={{ color: "hsl(215, 20%, 45%)" }}>
                              {msg.metadata.cached ? "⚡ Cached" : `${msg.metadata.took_ms}ms`}
                              {msg.metadata.provider && ` • ${msg.metadata.provider}`}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm leading-relaxed" style={{ color: "hsl(210, 40%, 98%)" }}>
                          {msg.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Typing Indicator */}
                {(isSearching || isAddingMessage) && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md px-5 py-4" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                      <TypingIndicator />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Chat Input */}
          <ChatInput
            onSend={handleSendMessage}
            isLoading={isSearching || isAddingMessage}
            disabled={!activeSessionId || !isOnline}
            placeholder={initialDocId ? "Ask about this document..." : "Ask about your documents..."}
          />
        </div>

        {/* Right: Citation Details Panel */}
        <div
          className="shrink-0 transition-all duration-300"
          style={{
            width: citationPanelOpen ? 380 : 0,
            opacity: citationPanelOpen ? 1 : 0,
            overflow: "hidden",
          }}
        >
          {selectedCitation && (
            <GlassmorphicCard variant="elevated" className="h-full">
              <div className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-xs uppercase tracking-wider" style={{ color: "hsl(215, 20%, 50%)" }}>
                    Citation Details
                  </span>
                  <button
                    onClick={() => setSelectedCitation(null)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ background: "rgba(255, 255, 255, 0.05)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")}
                  >
                    <Icon name="close" size={16} style={{ color: "hsl(215, 20%, 65%)" }} />
                  </button>
                </div>

                <div className="mb-5">
                  <h3 className="text-lg font-semibold mb-3" style={{ color: "hsl(210, 40%, 98%)" }}>
                    {selectedCitation.filename}
                  </h3>
                  <div className="flex gap-2">
                    {selectedCitation.page_number && (
                      <span className="px-3 py-1.5 rounded-lg text-xs" style={{ background: "rgba(255, 255, 255, 0.05)", color: "hsl(215, 20%, 65%)" }}>
                        Page {selectedCitation.page_number}
                      </span>
                    )}
                    <span className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "hsl(262 80% 65% / 0.15)", color: "hsl(262, 80%, 70%)" }}>
                      {(selectedCitation.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  <span className="text-xs uppercase tracking-wider mb-3 block" style={{ color: "hsl(215, 20%, 50%)" }}>
                    Excerpt
                  </span>
                  <div className="p-4 rounded-xl overflow-auto max-h-[300px]" style={{ background: "rgba(255, 255, 255, 0.03)" }}>
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(215, 20%, 75%)" }}>
                      {selectedCitation.chunk_text}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-5" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <Link href={`/documents?doc_id=${selectedCitation.doc_id}&page=${selectedCitation.page_number || 1}`}>
                    <KineticButton variant="secondary" fullWidth icon="open_in_new">
                      View in Document Matrix
                    </KineticButton>
                  </Link>
                </div>
              </div>
            </GlassmorphicCard>
          )}
        </div>
      </div>
    </div>
  );
}
