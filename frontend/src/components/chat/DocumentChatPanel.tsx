/**
 * DocumentChatPanel — Chat interface scoped to a specific document
 * Kinetic Observatory design aligned with Command Center dashboard
 */
"use client";

import { useState, useCallback, useEffect, CSSProperties } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { useChatSync } from "@/hooks/useChatSync";
import { apiClient } from "@/lib/api-client";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";
import type { ChatSession, ChatMessage, SearchResponse, SearchHit } from "@/types/api";

interface DocumentChatPanelProps {
  docId: string;
  filename: string;
  selectedText?: string | null;
  currentPage?: number;
  onClearSelection?: () => void;
  onCitationClick?: (citation: SearchHit) => void;
}

export function DocumentChatPanel({
  docId,
  filename,
  selectedText,
  currentPage,
  onClearSelection,
  onCitationClick,
}: DocumentChatPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Use chat sync hook with document filter
  const {
    sessions,
    messages,
    isOnline,
    isLoadingSessions,
    createSession,
    addMessage,
    isCreatingSession,
    isAddingMessage,
  } = useChatSync({
    docFilter: docId,
    sessionId: activeSessionId ?? undefined,
    enabled: true,
  });

  // Auto-select or create session on mount
  useEffect(() => {
    const initSession = async () => {
      // Try to find existing session for this document
      const existingSession = sessions.find(
        (s) => s.doc_filter === docId && s.is_active
      );

      if (existingSession) {
        setActiveSessionId(existingSession.id);
      } else if (sessions.length > 0) {
        // Has sessions but none for this doc - create new one
        try {
          const newSession = await createSession({
            title: `Chat: ${filename}`,
            doc_filter: docId,
          });
          setActiveSessionId(newSession.id);
        } catch (e) {
          console.error("Failed to create session:", e);
        }
      }
    };

    if (!isLoadingSessions && !activeSessionId) {
      initSession();
    }
  }, [sessions, docId, filename, createSession, isLoadingSessions, activeSessionId]);

  // Create new session for this document
  const handleNewSession = useCallback(async () => {
    try {
      const newSession = await createSession({
        title: `Chat: ${filename}`,
        doc_filter: docId,
      });
      setActiveSessionId(newSession.id);
    } catch (e) {
      console.error("Failed to create session:", e);
    }
  }, [createSession, docId, filename]);

  // Send message with RAG search
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeSessionId) {
        // Create session first
        const newSession = await createSession({
          title: content.slice(0, 50),
          doc_filter: docId,
        });
        setActiveSessionId(newSession.id);
      }

      const sessionId = activeSessionId!;

      // Add user message
      await addMessage(sessionId, {
        role: "user",
        content,
        citations: [],
        metadata: {},
      });

      // Perform search/RAG query
      setIsSearching(true);
      try {
        const searchResponse = await apiClient.post<SearchResponse>("search", {
          query: content,
          top_k: 5,
          doc_ids: [docId], // Filter to current document
        });

        // Add assistant response with citations
        await addMessage(sessionId, {
          role: "assistant",
          content: searchResponse.answer,
          citations: searchResponse.results,
          metadata: {
            took_ms: searchResponse.took_ms,
            cached: searchResponse.cached,
            provider: searchResponse.provider_used,
          },
        });
      } catch (e) {
        // Add error message
        await addMessage(sessionId, {
          role: "assistant",
          content: "Sorry, I encountered an error while searching. Please try again.",
          citations: [],
          metadata: {},
        });
      } finally {
        setIsSearching(false);
      }
    },
    [activeSessionId, docId, createSession, addMessage]
  );

  // Filter sessions for this document
  const documentSessions = sessions.filter((s) => s.doc_filter === docId);

  // Styles
  const headerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "var(--surface-container-low)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
  };

  const headerTitleStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const headerIconContainerStyles: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "linear-gradient(135deg, hsl(262 80% 65% / 0.15), hsl(200 90% 65% / 0.1))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const contextBannerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    background: "hsl(200 90% 65% / 0.06)",
    borderBottom: "1px solid hsl(200 90% 65% / 0.1)",
  };

  const selectStyles: CSSProperties = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 6,
    background: "var(--surface-container)",
    color: "hsl(215, 20%, 85%)",
    border: "none",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-base)" }}>
      {/* Header */}
      <div style={headerStyles}>
        <div style={headerTitleStyles}>
          <div style={headerIconContainerStyles}>
            <Icon name="chat" size={18} style={{ color: "hsl(262, 80%, 70%)" }} />
          </div>
          <div>
            <h4 
              style={{ 
                fontSize: 14, 
                fontWeight: 600, 
                color: "hsl(210, 40%, 98%)",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              Document Q&A
            </h4>
            {!isOnline && (
              <span 
                style={{ 
                  fontSize: 11, 
                  color: "hsl(38, 92%, 50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon name="cloud_off" size={10} />
                Offline
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {documentSessions.length > 1 && (
            <select
              value={activeSessionId ?? ""}
              onChange={(e) => setActiveSessionId(e.target.value)}
              style={selectStyles}
            >
              {documentSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.message_count} msgs)
                </option>
              ))}
            </select>
          )}
          <KineticButton
            variant="secondary"
            size="sm"
            icon="add"
            onClick={handleNewSession}
            loading={isCreatingSession}
            title="New chat session"
          >
            New
          </KineticButton>
        </div>
      </div>

      {/* Document Context Banner */}
      <div style={contextBannerStyles}>
        <Icon name="description" size={16} style={{ color: "hsl(200, 90%, 65%)" }} />
        <span 
          className="truncate flex-1" 
          style={{ fontSize: 13, color: "hsl(200, 90%, 65%)" }}
        >
          Searching only in: {filename}
        </span>
        {currentPage && (
          <>
            <span style={{ color: "hsl(215, 20%, 45%)" }}>•</span>
            <span style={{ fontSize: 12, color: "hsl(215, 20%, 65%)" }}>
              Page {currentPage}
            </span>
          </>
        )}
      </div>

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        isLoading={isSearching || isAddingMessage}
        onCitationClick={onCitationClick}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        isLoading={isSearching || isAddingMessage}
        disabled={!isOnline && !activeSessionId}
        placeholder="Ask about this document..."
        selectedText={selectedText}
        onClearSelection={onClearSelection}
      />
    </div>
  );
}
