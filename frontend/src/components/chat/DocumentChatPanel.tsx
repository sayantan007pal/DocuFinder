/**
 * DocumentChatPanel — Chat interface scoped to a specific document
 * Integrates with document viewer for contextual Q&A
 */
"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { useChatSync } from "@/hooks/useChatSync";
import { apiClient } from "@/lib/api-client";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/5"
        style={{ background: "rgba(19, 28, 43, 0.9)" }}
      >
        <div className="flex items-center gap-2">
          <Icon name="chat" size={18} className="text-primary" />
          <h4 className="text-sm font-medium text-white">Document Q&A</h4>
          {!isOnline && (
            <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
              Offline
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {documentSessions.length > 1 && (
            <select
              value={activeSessionId ?? ""}
              onChange={(e) => setActiveSessionId(e.target.value)}
              className="text-xs bg-white/5 text-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/50"
            >
              {documentSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.message_count} msgs)
                </option>
              ))}
            </select>
          )}
          <KineticButton
            variant="ghost"
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
      <div className="px-4 py-2 bg-cyan-500/5 border-b border-cyan-500/10">
        <div className="flex items-center gap-2 text-xs">
          <Icon name="description" size={14} className="text-cyan-400" />
          <span className="text-cyan-400 truncate">
            Searching only in: {filename}
          </span>
          {currentPage && (
            <>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">Page {currentPage}</span>
            </>
          )}
        </div>
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
