/**
 * ChatHistorySidebar — Collapsible sidebar listing chat sessions
 * Kinetic Observatory design aligned with Command Center dashboard
 */
"use client";

import { useState } from "react";
import { ChatSessionItem } from "./ChatSessionItem";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";
import { KineticButton } from "@/components/ui/kinetic-button";
import { KineticInput } from "@/components/ui/kinetic-input";
import { Icon } from "@/components/ui/icon";
import type { ChatSession } from "@/types/api";

interface ChatHistorySidebarProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isCreating?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isOnline?: boolean;
  pendingCount?: number;
}

export function ChatHistorySidebar({
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  isCreating,
  isCollapsed = false,
  onToggleCollapse,
  isOnline = true,
  pendingCount = 0,
}: ChatHistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter sessions by search query
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group sessions by date
  const groupedSessions = filteredSessions.reduce((acc, session) => {
    const date = new Date(session.updated_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let group: string;
    if (date.toDateString() === today.toDateString()) {
      group = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      group = "Yesterday";
    } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      group = "This Week";
    } else {
      group = "Older";
    }

    if (!acc[group]) acc[group] = [];
    acc[group].push(session);
    return acc;
  }, {} as Record<string, ChatSession[]>);

  const groupOrder = ["Today", "Yesterday", "This Week", "Older"];

  if (isCollapsed) {
    return (
      <div
        className="h-full flex flex-col items-center py-4 gap-3"
        style={{ 
          width: 72,
          background: "var(--surface-container-low)",
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="p-2.5 rounded-[10px] transition-all duration-150"
          style={{ color: "hsl(215, 20%, 65%)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-container)";
            e.currentTarget.style.color = "hsl(210, 40%, 90%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "hsl(215, 20%, 65%)";
          }}
          title="Expand sidebar"
        >
          <Icon name="menu" size={20} />
        </button>
        <button
          onClick={onNewSession}
          className="p-2.5 rounded-[10px] transition-all duration-150"
          style={{ 
            background: "linear-gradient(135deg, hsl(262 80% 65% / 0.2), hsl(200 90% 65% / 0.1))",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, hsl(262 80% 65% / 0.3), hsl(200 90% 65% / 0.2))";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, hsl(262 80% 65% / 0.2), hsl(200 90% 65% / 0.1))";
          }}
          title="New chat"
        >
          <Icon name="add" size={20} style={{ color: "hsl(262, 80%, 70%)" }} />
        </button>
        <div className="flex-1" />
        {!isOnline && (
          <span title="Offline">
            <Icon name="cloud_off" size={18} style={{ color: "hsl(38, 92%, 50%)" }} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{ 
        width: 280,
        background: "var(--surface-container-low)",
        transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 16px 20px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div className="flex items-center gap-3">
            <div 
              className="flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, hsl(262 80% 65% / 0.15), hsl(200 90% 65% / 0.1))",
              }}
            >
              <Icon name="history" size={20} style={{ color: "hsl(262, 80%, 70%)" }} />
            </div>
            <div>
              <h3 
                style={{ 
                  fontSize: 14, 
                  fontWeight: 600, 
                  color: "hsl(210, 40%, 98%)",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                }}
              >
                Chat History
              </h3>
              {pendingCount > 0 && (
                <span 
                  style={{ 
                    fontSize: 11, 
                    color: "hsl(38, 92%, 50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginTop: 2,
                  }}
                >
                  <Icon name="sync" size={10} className="animate-spin" />
                  {pendingCount} syncing
                </span>
              )}
            </div>
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg transition-all duration-150"
              style={{ color: "hsl(215, 20%, 55%)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface-container)";
                e.currentTarget.style.color = "hsl(210, 40%, 90%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "hsl(215, 20%, 55%)";
              }}
            >
              <Icon name="chevron_left" size={18} />
            </button>
          )}
        </div>

        {/* New Chat Button */}
        <KineticButton
          variant="primary"
          size="md"
          icon="add"
          fullWidth
          onClick={onNewSession}
          loading={isCreating}
        >
          New Chat
        </KineticButton>

        {/* Search */}
        {sessions.length > 5 && (
          <div style={{ marginTop: 12 }}>
            <KineticInput
              icon="search"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
            />
          </div>
        )}
      </div>

      {/* Status Bar - Offline Warning */}
      {!isOnline && (
        <GlassmorphicCard 
          style={{ 
            margin: "0 12px 12px", 
            padding: "10px 14px",
            background: "hsl(38 92% 50% / 0.1)",
          }}
        >
          <div className="flex items-center gap-2" style={{ fontSize: 12, color: "hsl(38, 92%, 50%)" }}>
            <Icon name="cloud_off" size={14} />
            <span>Offline — changes sync on reconnect</span>
          </div>
        </GlassmorphicCard>
      )}

      {/* Sessions List */}
      <div className="flex-1 overflow-auto" style={{ padding: "0 12px 12px" }}>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: 24 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "linear-gradient(135deg, hsl(262 80% 65% / 0.1), hsl(200 90% 65% / 0.05))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Icon name="chat_bubble_outline" size={32} style={{ color: "hsl(215, 20%, 45%)" }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "hsl(215, 20%, 75%)", marginBottom: 4 }}>
              No chat history yet
            </p>
            <p style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
              Start a new conversation to begin
            </p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center" style={{ height: 140 }}>
            <Icon name="search_off" size={28} style={{ color: "hsl(215, 20%, 45%)", marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: "hsl(215, 20%, 65%)" }}>
              No chats match "{searchQuery}"
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {groupOrder.map((group) => {
              const groupSessions = groupedSessions[group];
              if (!groupSessions?.length) return null;

              return (
                <div key={group}>
                  <h4 
                    style={{ 
                      padding: "0 12px",
                      marginBottom: 8,
                      fontSize: 11, 
                      fontWeight: 600, 
                      color: "hsl(215, 20%, 55%)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {group}
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {groupSessions.map((session) => (
                      <ChatSessionItem
                        key={session.id}
                        session={session}
                        isActive={session.id === activeSessionId}
                        onClick={() => onSessionSelect(session.id)}
                        onRename={(title) => onRenameSession(session.id, title)}
                        onDelete={() => onDeleteSession(session.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
