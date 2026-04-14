"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { TopAppBar } from "@/components/layout/top-app-bar";
import {
  Icon,
  Icons,
  GlassmorphicCard,
  KineticButton,
  ProgressBar,
} from "@/components/ui";
import type { SearchResponse, SearchHit } from "@/types/api";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: SearchHit[];
  timestamp: Date;
  metadata?: {
    took_ms?: number;
    cached?: boolean;
    provider?: string;
  };
}

export default function IntelligenceTerminalPage() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("doc_id");
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedCitation, setSelectedCitation] = useState<SearchHit | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("chat-messages");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } catch (e) {
        console.error("Failed to parse saved messages");
      }
    }
  }, []);
  
  // Save to localStorage on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("chat-messages", JSON.stringify(messages));
    }
  }, [messages]);
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const searchMutation = useMutation({
    mutationFn: (query: string) => 
      apiClient.post<SearchResponse>("search", { 
        query, 
        top_k: 8,
        ...(initialDocId ? { doc_ids: [initialDocId] } : {}),
      }),
    onSuccess: (data, query) => {
      // Only show citations with score > 50%
      const filteredCitations = data.results.filter(r => r.score > 0.5);
      
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.answer || "I found relevant information in your documents.",
        citations: filteredCitations,
        timestamp: new Date(),
        metadata: {
          took_ms: data.took_ms,
          cached: data.cached,
          provider: data.provider_used,
        },
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
  });

  const handleSend = () => {
    if (!input.trim() || searchMutation.isPending) return;
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    searchMutation.mutate(input.trim());
    setInput("");
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem("chat-messages");
  };

  const quickCommands = [
    { label: "/summarize recent", icon: "summarize" },
    { label: "/search policies", icon: "policy" },
    { label: "/compare versions", icon: "compare" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <TopAppBar 
        actions={
          messages.length > 0 ? (
            <KineticButton variant="ghost" size="sm" icon="delete" onClick={clearHistory}>
              Clear
            </KineticButton>
          ) : null
        }
      />

      <div style={{ display: "flex", flex: 1, gap: 24, minHeight: 0 }}>
        {/* Left: Chat Interface */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Session Info */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 16, 
            marginBottom: 16,
            padding: "12px 16px",
            background: "var(--surface-container-low)",
            borderRadius: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="tag" size={14} style={{ color: "hsl(215, 20%, 55%)" }} />
              <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
                Session: {new Date().toLocaleDateString()}
              </span>
            </div>
            {initialDocId && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="filter_alt" size={14} style={{ color: "hsl(262, 80%, 70%)" }} />
                <span style={{ fontSize: 12, color: "hsl(262, 80%, 70%)" }}>
                  Filtered to document
                </span>
              </div>
            )}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "hsl(142, 76%, 50%)" }}>●</span>
              <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>Active</span>
            </div>
          </div>

          {/* Messages Area */}
          <div 
            style={{ 
              flex: 1, 
              overflowY: "auto", 
              display: "flex", 
              flexDirection: "column",
              gap: 16,
              paddingRight: 8,
            }}
          >
            {messages.length === 0 ? (
              <div style={{ 
                flex: 1, 
                display: "flex", 
                flexDirection: "column",
                alignItems: "center", 
                justifyContent: "center",
                textAlign: "center",
                padding: 40,
              }}>
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
                  <Icon name={Icons.ai} size={40} style={{ color: "#fff" }} />
                </div>
                <h2 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 8 }}>
                  Intelligence Terminal
                </h2>
                <p style={{ color: "hsl(215, 20%, 55%)", fontSize: 14, maxWidth: 400, marginBottom: 24 }}>
                  Ask questions about your documents. The AI will analyze, reason, and provide answers with source citations.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {["What are the key policies?", "Summarize recent documents", "Compare contract terms"].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                      }}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 20,
                        background: "var(--surface-container)",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "hsl(215, 20%, 75%)",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--surface-container-high)";
                        e.currentTarget.style.color = "hsl(210, 40%, 98%)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--surface-container)";
                        e.currentTarget.style.color = "hsl(215, 20%, 75%)";
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble 
                  key={message.id} 
                  message={message} 
                  onCitationClick={setSelectedCitation}
                />
              ))
            )}
            
            {/* Loading indicator */}
            {searchMutation.isPending && (
              <div style={{ display: "flex", gap: 12, padding: "16px 0" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={Icons.ai} size={18} style={{ color: "#fff" }} />
                </div>
                <GlassmorphicCard style={{ padding: 16, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Icon name={Icons.processing} size={18} className="animate-spin" style={{ color: "hsl(262, 80%, 70%)" }} />
                    <span style={{ fontSize: 14, color: "hsl(215, 20%, 65%)" }}>
                      Analyzing documents...
                    </span>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <ProgressBar value={65} variant="gradient" size="sm" />
                  </div>
                </GlassmorphicCard>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Command Input Bar */}
          <div 
            className="glass-elevated"
            style={{ 
              marginTop: 16,
              padding: "16px 20px",
              borderRadius: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--surface-container)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={Icons.attach} size={20} style={{ color: "hsl(215, 20%, 65%)" }} />
              </button>
              
              <div style={{ flex: 1, position: "relative" }}>
                <span 
                  style={{ 
                    position: "absolute",
                    left: 16,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13,
                    color: "hsl(262, 80%, 70%)",
                    fontFamily: "monospace",
                  }}
                >
                  System://
                </span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Ask about your documents..."
                  style={{
                    width: "100%",
                    padding: "14px 16px 14px 90px",
                    borderRadius: 10,
                    background: "var(--surface-container-low)",
                    border: "none",
                    color: "hsl(210, 40%, 98%)",
                    fontSize: 15,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <button
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--surface-container)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={Icons.microphone} size={20} style={{ color: "hsl(215, 20%, 65%)" }} />
              </button>

              <KineticButton
                variant="primary"
                icon={Icons.send}
                onClick={handleSend}
                disabled={!input.trim() || searchMutation.isPending}
              >
                Execute
              </KineticButton>
            </div>

            {/* Quick Commands */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {quickCommands.map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => setInput(cmd.label)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--surface-container)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "hsl(215, 20%, 65%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon name={cmd.icon} size={14} />
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Context Panel */}
        <div style={{ width: 380, flexShrink: 0 }}>
          {selectedCitation ? (
            <GlassmorphicCard variant="elevated" style={{ padding: 24, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <span className="uppercase-label">Citation Details</span>
                <button
                  onClick={() => setSelectedCitation(null)}
                  style={{
                    background: "var(--surface-container)",
                    border: "none",
                    borderRadius: 6,
                    width: 28,
                    height: 28,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={Icons.close} size={16} style={{ color: "hsl(215, 20%, 65%)" }} />
                </button>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h3 className="font-display" style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 8 }}>
                  {selectedCitation.filename}
                </h3>
                <div style={{ display: "flex", gap: 8 }}>
                  {selectedCitation.page_number && (
                    <span style={{
                      padding: "4px 10px",
                      background: "var(--surface-container)",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "hsl(215, 20%, 65%)",
                    }}>
                      Page {selectedCitation.page_number}
                    </span>
                  )}
                  <span style={{
                    padding: "4px 10px",
                    background: "hsl(262 80% 65% / 0.15)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "hsl(262, 80%, 70%)",
                    fontWeight: 500,
                  }}>
                    {(selectedCitation.score * 100).toFixed(0)}% match
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <span className="uppercase-label" style={{ marginBottom: 8, display: "block" }}>
                  Excerpt
                </span>
                <p style={{ 
                  fontSize: 14, 
                  color: "hsl(215, 20%, 75%)", 
                  lineHeight: 1.7,
                  padding: 16,
                  background: "var(--surface-container-low)",
                  borderRadius: 10,
                }}>
                  {selectedCitation.chunk_text}
                </p>
              </div>

              <Link href={`/documents?doc_id=${selectedCitation.doc_id}`}>
                <KineticButton variant="secondary" fullWidth icon="open_in_new">
                  View in Document Matrix
                </KineticButton>
              </Link>
            </GlassmorphicCard>
          ) : (
            <GlassmorphicCard 
              style={{ 
                padding: 40, 
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: "var(--surface-container)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Icon name="touch_app" size={28} style={{ color: "hsl(215, 20%, 45%)" }} />
              </div>
              <h3 className="font-display" style={{ fontSize: "1rem", fontWeight: 500, marginBottom: 8 }}>
                Awaiting Selection
              </h3>
              <p style={{ fontSize: 13, color: "hsl(215, 20%, 55%)" }}>
                Select a citation from the chat to view details and navigate to the source document.
              </p>
              
              <div style={{ 
                marginTop: 24, 
                padding: "12px 16px", 
                background: "var(--surface-container-low)",
                borderRadius: 10,
                width: "100%",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "hsl(142, 76%, 50%)" }}>●</span>
                  <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
                    Buffer: IDLE
                  </span>
                </div>
              </div>
            </GlassmorphicCard>
          )}
        </div>
      </div>
    </div>
  );
}

// Message Bubble Component
function MessageBubble({ 
  message, 
  onCitationClick 
}: { 
  message: ChatMessage;
  onCitationClick: (citation: SearchHit) => void;
}) {
  const isUser = message.role === "user";
  
  return (
    <div 
      style={{ 
        display: "flex", 
        gap: 12,
        flexDirection: isUser ? "row-reverse" : "row",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: isUser 
            ? "var(--surface-container-high)"
            : "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon 
          name={isUser ? Icons.user : Icons.ai} 
          size={18} 
          style={{ color: isUser ? "hsl(215, 20%, 65%)" : "#fff" }} 
        />
      </div>

      {/* Content */}
      <div style={{ maxWidth: "75%", minWidth: 0 }}>
        <GlassmorphicCard
          variant={isUser ? "panel" : "default"}
          style={{
            padding: 16,
            ...(isUser && {
              background: "var(--surface-container-high)",
            }),
          }}
        >
          <p style={{ 
            fontSize: 14, 
            color: "hsl(210, 40%, 98%)", 
            lineHeight: 1.7,
            margin: 0,
          }}>
            {message.content}
          </p>

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--surface-container-high)" }}>
              <span style={{ fontSize: 11, color: "hsl(215, 20%, 55%)", display: "block", marginBottom: 8 }}>
                Sources ({message.citations.length})
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {message.citations.slice(0, 5).map((citation, i) => (
                  <button
                    key={`${citation.doc_id}-${i}`}
                    onClick={() => onCitationClick(citation)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: "hsl(262 80% 65% / 0.1)",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      color: "hsl(262, 80%, 75%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "hsl(262 80% 65% / 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "hsl(262 80% 65% / 0.1)";
                    }}
                    title={`${citation.filename} - ${(citation.score * 100).toFixed(0)}% match`}
                  >
                    <Icon name="article" size={12} />
                    {citation.page_number ? `Page ${citation.page_number}` : `Doc-${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </GlassmorphicCard>

        {/* Metadata */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 12, 
          marginTop: 6,
          paddingLeft: 4,
          flexDirection: isUser ? "row-reverse" : "row",
        }}>
          <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)" }}>
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {message.metadata?.took_ms && (
            <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)" }}>
              {message.metadata.took_ms.toFixed(0)}ms
            </span>
          )}
          {message.metadata?.cached && (
            <span style={{ fontSize: 11, color: "hsl(142, 76%, 50%)" }}>
              Cached
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
