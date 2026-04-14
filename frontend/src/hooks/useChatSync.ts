/**
 * useChatSync — Hook for chat persistence with offline caching and sync
 * Stores chat messages in localStorage as fallback, syncs to API when online
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ChatSession, ChatMessage, ChatSessionListResponse, ChatMessagesResponse } from "@/types/api";

const CACHE_KEY_PREFIX = "chat_cache_";
const PENDING_MESSAGES_KEY = "chat_pending_messages";

interface PendingMessage {
  sessionId: string;
  message: Omit<ChatMessage, "id" | "created_at">;
  createdAt: string;
  tempId: string;
}

interface UseChatSyncOptions {
  docFilter?: string;
  sessionId?: string;
  enabled?: boolean;
}

export function useChatSync(options: UseChatSyncOptions = {}) {
  const { docFilter, sessionId, enabled = true } = options;
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const syncInProgress = useRef(false);

  // Track online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ========== Sessions ==========

  // Fetch sessions
  const sessionsQuery = useQuery({
    queryKey: ["chatSessions", docFilter],
    queryFn: async (): Promise<ChatSession[]> => {
      const params = new URLSearchParams();
      if (docFilter) params.set("doc_filter", docFilter);
      const response = await apiClient.get<ChatSessionListResponse>(
        `chat/sessions?${params.toString()}`
      );
      return response.sessions;
    },
    enabled: enabled && isOnline,
    staleTime: 30_000,
    retry: false,
  });

  // Create session
  const createSessionMutation = useMutation({
    mutationFn: async (data: { title?: string; doc_filter?: string }) => {
      return apiClient.post<ChatSession>("chat/sessions", data);
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
      return session;
    },
  });

  // Update session (rename)
  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title?: string; is_active?: boolean } }) => {
      return apiClient.patch<ChatSession>(`chat/sessions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
    },
  });

  // Delete session
  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`chat/sessions/${id}`);
      // Clear local cache
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
    },
  });

  // ========== Messages ==========

  // Fetch messages for a session
  const messagesQuery = useQuery({
    queryKey: ["chatMessages", sessionId],
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!sessionId) return [];
      const response = await apiClient.get<ChatMessagesResponse>(
        `chat/sessions/${sessionId}/messages`
      );
      // Cache in localStorage
      try {
        localStorage.setItem(
          `${CACHE_KEY_PREFIX}${sessionId}`,
          JSON.stringify(response.messages)
        );
      } catch (e) {
        console.warn("Failed to cache messages:", e);
      }
      return response.messages;
    },
    enabled: enabled && isOnline && !!sessionId,
    staleTime: 10_000,
    retry: false,
    // Use cached data while offline or loading
    placeholderData: () => {
      if (!sessionId) return [];
      try {
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${sessionId}`);
        return cached ? JSON.parse(cached) : [];
      } catch {
        return [];
      }
    },
  });

  // Get cached messages when offline
  const getCachedMessages = useCallback((sessId: string): ChatMessage[] => {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${sessId}`);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  }, []);

  // Add message
  const addMessageMutation = useMutation({
    mutationFn: async ({
      sessionId,
      message,
    }: {
      sessionId: string;
      message: Omit<ChatMessage, "id" | "created_at">;
    }) => {
      if (isOnline) {
        return apiClient.post<ChatMessage>(`chat/sessions/${sessionId}/messages`, message);
      } else {
        // Store as pending when offline
        const pendingMessage: PendingMessage = {
          sessionId,
          message,
          createdAt: new Date().toISOString(),
          tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };

        const pending = getPendingMessages();
        pending.push(pendingMessage);
        localStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(pending));

        // Return a fake message for optimistic UI
        return {
          id: pendingMessage.tempId,
          ...message,
          created_at: pendingMessage.createdAt,
        } as ChatMessage;
      }
    },
    onSuccess: (newMessage, { sessionId }) => {
      // Update local cache optimistically
      queryClient.setQueryData<ChatMessage[]>(
        ["chatMessages", sessionId],
        (old = []) => [...old, newMessage]
      );

      // Update localStorage cache
      try {
        const cached = getCachedMessages(sessionId);
        cached.push(newMessage);
        localStorage.setItem(`${CACHE_KEY_PREFIX}${sessionId}`, JSON.stringify(cached));
      } catch (e) {
        console.warn("Failed to cache message:", e);
      }

      // Invalidate sessions to update message_count
      queryClient.invalidateQueries({ queryKey: ["chatSessions"] });
    },
  });

  // ========== Sync Pending Messages ==========

  const getPendingMessages = (): PendingMessage[] => {
    try {
      const pending = localStorage.getItem(PENDING_MESSAGES_KEY);
      return pending ? JSON.parse(pending) : [];
    } catch {
      return [];
    }
  };

  const syncPendingMessages = useCallback(async () => {
    if (!isOnline || syncInProgress.current) return;

    const pending = getPendingMessages();
    if (pending.length === 0) return;

    syncInProgress.current = true;
    const synced: string[] = [];

    for (const item of pending) {
      try {
        await apiClient.post<ChatMessage>(
          `chat/sessions/${item.sessionId}/messages`,
          item.message
        );
        synced.push(item.tempId);
      } catch (e) {
        console.error("Failed to sync message:", e);
      }
    }

    // Remove synced messages from pending
    const remaining = pending.filter((p) => !synced.includes(p.tempId));
    localStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(remaining));

    // Refresh data
    queryClient.invalidateQueries({ queryKey: ["chatMessages"] });
    queryClient.invalidateQueries({ queryKey: ["chatSessions"] });

    syncInProgress.current = false;
  }, [isOnline, queryClient]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline) {
      syncPendingMessages();
    }
  }, [isOnline, syncPendingMessages]);

  // ========== Public API ==========

  const sessions = sessionsQuery.data ?? [];
  const messages = messagesQuery.data ?? getCachedMessages(sessionId ?? "");
  const pendingCount = getPendingMessages().length;

  return {
    // State
    sessions,
    messages,
    isOnline,
    pendingCount,
    
    // Loading states
    isLoadingSessions: sessionsQuery.isLoading,
    isLoadingMessages: messagesQuery.isLoading,
    
    // Error states
    sessionsError: sessionsQuery.error,
    messagesError: messagesQuery.error,

    // Session actions
    createSession: createSessionMutation.mutateAsync,
    updateSession: (id: string, data: { title?: string; is_active?: boolean }) =>
      updateSessionMutation.mutateAsync({ id, data }),
    deleteSession: deleteSessionMutation.mutateAsync,
    isCreatingSession: createSessionMutation.isPending,
    isUpdatingSession: updateSessionMutation.isPending,
    isDeletingSession: deleteSessionMutation.isPending,

    // Message actions
    addMessage: (sessionId: string, message: Omit<ChatMessage, "id" | "created_at">) =>
      addMessageMutation.mutateAsync({ sessionId, message }),
    isAddingMessage: addMessageMutation.isPending,

    // Sync
    syncPendingMessages,
    
    // Refresh
    refreshSessions: () => queryClient.invalidateQueries({ queryKey: ["chatSessions"] }),
    refreshMessages: () => queryClient.invalidateQueries({ queryKey: ["chatMessages", sessionId] }),
  };
}
