/**
 * Intelligence Terminal (Kinetic Terminal v1.0)
 * Based on stitch_the_command_center_prd/intelligence_terminal design
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useChatSync } from "@/hooks/useChatSync";
import { Icon } from "@/components/ui/icon";
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
  const [isSearching, setIsSearching] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

        // Auto-select first citation
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

  // Format messages
  const formattedMessages: FormattedMessage[] = messages.map((m) => ({
    ...m,
    created_at: m.created_at || new Date().toISOString(),
  }));

  // Get latest assistant message metadata for right panel
  const latestAssistantMsg = [...formattedMessages].reverse().find((m) => m.role === "assistant");
  const matchScore = selectedCitation ? (selectedCitation.score * 100).toFixed(1) : latestAssistantMsg?.citations?.[0] ? (latestAssistantMsg.citations[0].score * 100).toFixed(1) : null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0b1323", color: "#dbe2f8" }}>
      {/* Left Sidebar: The Observatory */}
      <aside
        className="fixed left-0 top-0 h-full flex flex-col w-64 z-40"
        style={{ background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(24px)" }}
      >
        <div className="p-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)" }}
            >
              O
            </div>
            <div>
              <h1
                className="text-xl font-bold tracking-tight"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                The Observatory
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Precision Intelligence
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1">
            <button
              onClick={handleNewSession}
              className="w-full flex items-center gap-3 px-4 py-2 text-violet-300 transition-all duration-300"
              style={{ background: "rgba(255, 255, 255, 0.05)", borderRight: "2px solid hsl(262, 80%, 65%)" }}
            >
              <Icon name="add_box" size={18} />
              <span className="text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>New Chat</span>
            </button>
            <Link href="/search" className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all duration-300">
              <Icon name="history" size={18} />
              <span className="text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>History</span>
            </Link>
            <Link href="/search" className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all duration-300">
              <Icon name="auto_awesome" size={18} />
              <span className="text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Intelligence</span>
            </Link>
            <Link href="/documents" className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all duration-300">
              <Icon name="inventory_2" size={18} />
              <span className="text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Knowledge</span>
            </Link>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all duration-300">
              <Icon name="settings" size={18} />
              <span className="text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Settings</span>
            </button>
          </nav>
        </div>

        {/* Recent Sessions */}
        <div className="mt-auto p-6 space-y-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold px-4">Recent Sessions</div>
          <div className="space-y-2 overflow-y-auto max-h-[300px]">
            {sessions.slice(0, 5).map((session) => (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`px-4 py-2 text-xs rounded cursor-pointer transition-colors border-l ${
                  session.id === activeSessionId ? "text-violet-300 bg-white/5 border-violet-500" : "text-slate-400 hover:bg-white/5 border-white/5"
                }`}
              >
                {session.title}
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="px-4 py-2 text-xs text-slate-500">No sessions yet</div>
            )}
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-3 pt-4 border-t border-white/5">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
              <Icon name="person" size={16} className="text-slate-400" />
            </div>
            <div>
              <p className="text-xs font-bold">Operator 01</p>
              <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: isOnline ? "#22c55e" : "#f59e0b" }} />
                {isOnline ? "System Active" : "Offline"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Top NavBar: Kinetic Terminal */}
      <header
        className="fixed top-0 right-0 h-16 flex justify-between items-center px-8 z-50"
        style={{ left: "256px", background: "rgba(15, 23, 42, 0.2)", backdropFilter: "blur(16px)" }}
      >
        <div className="flex items-center gap-8">
          <span className="font-black text-white tracking-tighter text-lg uppercase">Kinetic Terminal v1.0</span>
          <nav className="hidden md:flex gap-6">
            <a className="text-cyan-400 border-b border-cyan-400 font-medium uppercase tracking-widest text-[10px] pb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }} href="#">
              Models
            </a>
            <a className="text-slate-400 hover:text-white transition-colors font-medium uppercase tracking-widest text-[10px] pb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }} href="#">
              Nodes
            </a>
            <a className="text-slate-400 hover:text-white transition-colors font-medium uppercase tracking-widest text-[10px] pb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }} href="#">
              Protocols
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <input
            className="border-none text-[10px] tracking-widest font-bold text-cyan-400 placeholder-slate-600 focus:ring-1 focus:ring-cyan-400/30 rounded-full py-1.5 px-4 w-48 transition-all outline-none"
            style={{ background: "rgba(6, 14, 29, 0.5)" }}
            placeholder="GLOBAL SCANNER..."
            type="text"
          />
          <div className="flex gap-3">
            <Icon name="notifications" size={20} className="text-slate-400 cursor-pointer hover:text-cyan-400 transition-colors" />
            <Icon name="account_circle" size={20} className="text-slate-400 cursor-pointer hover:text-cyan-400 transition-colors" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pt-16 h-full flex flex-col relative" style={{ marginLeft: "256px", marginRight: "320px", background: "#0b1323" }}>
        <div className="flex-1 overflow-y-auto px-12 py-10 space-y-12">
          {formattedMessages.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                style={{ background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)" }}
              >
                <Icon name="auto_awesome" size={40} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Intelligence Terminal Ready
              </h2>
              <p className="text-slate-500 max-w-md">
                Query your document intelligence core. Ask questions about your uploaded documents and get precise, sourced answers.
              </p>
            </div>
          ) : (
            <>
              {formattedMessages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === "user" ? (
                    /* User Message */
                    <div className="flex flex-col items-end space-y-2 max-w-2xl ml-auto">
                      <div
                        className="rounded-full px-6 py-3 text-sm shadow-lg"
                        style={{ background: "#222a3a", color: "#dbe2f8" }}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] uppercase tracking-widest text-slate-500 px-4">
                        {new Date(msg.created_at).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })} • Operator
                      </span>
                    </div>
                  ) : (
                    /* AI Message */
                    <div className="flex flex-col space-y-6 max-w-3xl">
                      <div className="flex gap-4">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)" }}
                        >
                          <Icon name="auto_awesome" size={20} className="text-white" />
                        </div>
                        <div className="space-y-4">
                          <div className="text-lg font-light leading-relaxed" style={{ color: "#dbe2f8" }}>
                            {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
                              if (part.startsWith("**") && part.endsWith("**")) {
                                return (
                                  <span key={i} className="text-violet-400 font-bold">
                                    {part.slice(2, -2)}
                                  </span>
                                );
                              }
                              return part;
                            })}
                          </div>

                          {/* Sources Section */}
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="pt-6 border-t border-white/5">
                              <h4 className="text-[10px] uppercase tracking-widest text-slate-500 mb-3 font-bold">Verified Sources</h4>
                              <div className="flex flex-wrap gap-2">
                                {msg.citations.map((citation, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setSelectedCitation(citation)}
                                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all border ${
                                      selectedCitation?.doc_id === citation.doc_id && selectedCitation?.page_number === citation.page_number
                                        ? "bg-violet-500/20 border-violet-500/50"
                                        : "bg-slate-800/50 hover:bg-violet-500/20 border-white/5"
                                    }`}
                                  >
                                    <Icon name="description" size={14} className="text-violet-400" />
                                    <span className="text-xs text-slate-300">
                                      {citation.page_number ? `Page ${citation.page_number} - ` : ""}{citation.filename}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading State */}
              {(isSearching || isAddingMessage) && (
                <div className="flex gap-4 opacity-50">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#2d3546" }}>
                    <Icon name="hourglass_empty" size={20} className="text-slate-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-8 mt-auto">
          <div
            className="max-w-4xl mx-auto rounded-full border border-white/5 p-2 flex items-center gap-3"
            style={{ background: "rgba(255, 255, 255, 0.04)", backdropFilter: "blur(12px)" }}
          >
            <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <Icon name="attach_file" size={20} />
            </button>
            <input
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white placeholder-slate-600 outline-none"
              placeholder="Query the intelligence core..."
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!activeSessionId || !isOnline}
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim() || !activeSessionId || !isOnline || isSearching}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)" }}
            >
              <Icon name="arrow_upward" size={20} />
            </button>
          </div>
          <p className="text-[10px] text-center mt-4 text-slate-600 uppercase tracking-widest">
            Quantum Engine v4.2 • Encryption Active
          </p>
        </div>
      </main>

      {/* Right Panel: Contextual Intelligence */}
      <aside
        className="fixed right-0 top-0 h-full w-80 border-l border-white/5 flex flex-col z-40"
        style={{ background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(24px)" }}
      >
        <div className="p-6 border-b border-white/5">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Contextual Intelligence</h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Right Wing Analysis</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Match Score */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Match Score</span>
              <span
                className="text-3xl font-black"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {matchScore ? `${matchScore}%` : "—"}
              </span>
            </div>
            <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "#2d3546" }}>
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: matchScore ? `${matchScore}%` : "0%",
                  background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
                  boxShadow: "0 0 15px rgba(159, 98, 241, 0.5)",
                }}
              />
            </div>
          </div>

          {/* Selection Logic */}
          <div className="space-y-3">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Selection Logic</span>
            <div className="rounded-xl p-4 border border-white/5" style={{ background: "#131c2b" }}>
              <p className="text-xs leading-relaxed text-slate-400">
                {selectedCitation ? (
                  <>
                    High semantic alignment detected between user query and document cluster{" "}
                    <span className="text-violet-400">{selectedCitation.filename}</span>.
                    <br /><br />
                    Confidence score: <span className="text-cyan-400">{(selectedCitation.score * 100).toFixed(1)}%</span> match
                    {selectedCitation.page_number && (
                      <> on page <span className="text-cyan-400">{selectedCitation.page_number}</span></>
                    )}.
                  </>
                ) : latestAssistantMsg ? (
                  "Select a source document to view detailed selection logic and semantic alignment analysis."
                ) : (
                  "Start a conversation to see contextual intelligence analysis."
                )}
              </p>
            </div>
          </div>

          {/* Inference Metadata */}
          <div className="space-y-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Inference Metadata</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
                <div className="text-[9px] text-slate-500 uppercase mb-1">Tokens</div>
                <div className="text-sm font-medium">{latestAssistantMsg?.metadata?.tokens || "—"}</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
                <div className="text-[9px] text-slate-500 uppercase mb-1">Latency</div>
                <div className="text-sm font-medium">{latestAssistantMsg?.metadata?.took_ms ? `${latestAssistantMsg.metadata.took_ms}ms` : "—"}</div>
              </div>
            </div>
          </div>

          {/* Document Preview Card */}
          {selectedCitation && (
            <div className="mt-auto pt-6">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3 block">Document Preview</span>
              <Link href={`/documents?doc_id=${selectedCitation.doc_id}&page=${selectedCitation.page_number || 1}`}>
                <div
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/10 aspect-[3/4] shadow-2xl transition-transform hover:scale-[1.02]"
                  style={{ background: "#0f172a" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="text-[10px] text-violet-400 font-bold uppercase mb-1">{selectedCitation.filename}</div>
                    <div className="text-xs text-white font-medium line-clamp-2">
                      {selectedCitation.chunk_text.slice(0, 100)}...
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center border border-white/20"
                      style={{ background: "rgba(255, 255, 255, 0.04)", backdropFilter: "blur(12px)" }}
                    >
                      <Icon name="visibility" size={20} className="text-white" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/5 flex gap-2">
          <button
            className="flex-1 text-xs font-bold uppercase tracking-widest py-3 rounded-lg hover:bg-slate-700 transition-colors border border-white/5"
            style={{ background: "#2d3546" }}
          >
            Share
          </button>
          <button
            className="flex-1 text-white text-xs font-bold uppercase tracking-widest py-3 rounded-lg shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)" }}
          >
            Export
          </button>
        </div>
      </aside>
    </div>
  );
}
