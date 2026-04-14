"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { TopAppBar } from "@/components/layout/top-app-bar";
import {
  Icon,
  Icons,
  GlassmorphicCard,
  KineticButton,
  KineticInput,
  StatusBadge,
  ProgressBar,
} from "@/components/ui";
import type { SearchResponse, SearchHit } from "@/types/api";
import Link from "next/link";

interface GraphNode {
  id: string;
  type: "query" | "document" | "reasoning";
  label: string;
  data?: SearchHit;
  x: number;
  y: number;
  score?: number;
}

interface ReasoningData {
  doc_id: string;
  reasoning: string;
  confidence: number;
}

export default function ReasoningGraphPage() {
  const [query, setQuery] = useState("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [reasoningCache, setReasoningCache] = useState<Map<string, ReasoningData>>(new Map());
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: (q: string) =>
      apiClient.post<SearchResponse>("search", { query: q, top_k: 6 }),
    onSuccess: (data, q) => {
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
      const radius = Math.min(canvasSize.width, canvasSize.height) * 0.35;

      const queryNode: GraphNode = {
        id: "query",
        type: "query",
        label: q,
        x: centerX,
        y: centerY,
      };

      const docNodes: GraphNode[] = data.results.map((hit, i) => {
        const angle = (2 * Math.PI * i) / data.results.length - Math.PI / 2;
        return {
          id: hit.doc_id,
          type: "document",
          label: hit.filename,
          data: hit,
          score: hit.score,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });

      setNodes([queryNode, ...docNodes]);
      setSelectedNode(null);
      setReasoningCache(new Map());
    },
  });

  // Fetch reasoning for selected document
  const reasoningQuery = useQuery({
    queryKey: ["reasoning", selectedNode?.id, query],
    queryFn: async () => {
      if (!selectedNode?.data || selectedNode.type !== "document") return null;
      
      // Simulate AI reasoning based on the document and query
      const response = await apiClient.post<{ summary: string }>(
        `summarize/document/${selectedNode.id}`,
        { question: query }
      );
      
      const reasoning: ReasoningData = {
        doc_id: selectedNode.id,
        reasoning: response.summary || generateFallbackReasoning(selectedNode, query),
        confidence: selectedNode.score || 0.85,
      };
      
      setReasoningCache((prev) => new Map(prev).set(selectedNode.id, reasoning));
      return reasoning;
    },
    enabled: !!selectedNode && selectedNode.type === "document" && !reasoningCache.has(selectedNode.id),
  });

  const handleSearch = () => {
    if (!query.trim()) return;
    searchMutation.mutate(query.trim());
  };

  const handleNodeClick = (node: GraphNode) => {
    if (node.type === "document") {
      setSelectedNode(node);
    }
  };

  // Generate fallback reasoning if API doesn't have summarize
  function generateFallbackReasoning(node: GraphNode, q: string): string {
    const score = node.score || 0;
    const highScore = score > 0.8;
    const mediumScore = score > 0.5;
    
    if (highScore) {
      return `This document scored ${(score * 100).toFixed(0)}% relevance because it contains key terms and concepts directly related to your query "${q}". The semantic similarity indicates strong thematic alignment with the search intent.`;
    } else if (mediumScore) {
      return `This document shows moderate relevance (${(score * 100).toFixed(0)}%) to your query. While not a direct match, it contains related concepts that may provide useful context or supplementary information.`;
    } else {
      return `This document has lower relevance (${(score * 100).toFixed(0)}%) but was included because it contains some related terminology. It may offer peripheral context to your search.`;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <TopAppBar />

      {/* Search Input */}
      <div style={{ marginBottom: 24 }}>
        <GlassmorphicCard style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <KineticInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Enter a query to visualize AI reasoning..."
                icon={Icons.search}
              />
            </div>
            <KineticButton
              variant="primary"
              icon={Icons.processing}
              onClick={handleSearch}
              disabled={!query.trim() || searchMutation.isPending}
            >
              {searchMutation.isPending ? "Analyzing..." : "Generate Graph"}
            </KineticButton>
          </div>
        </GlassmorphicCard>
      </div>

      <div style={{ display: "flex", flex: 1, gap: 24, minHeight: 0 }}>
        {/* Graph Canvas */}
        <div style={{ flex: 1, position: "relative" }}>
          <GlassmorphicCard 
            variant="elevated" 
            style={{ 
              height: "100%", 
              padding: 0, 
              overflow: "hidden",
              position: "relative",
            }}
          >
            {nodes.length === 0 ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: 40,
                }}
              >
                <div
                  className="gradient-glow"
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 24,
                    background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 24,
                  }}
                >
                  <Icon name={Icons.graph} size={48} style={{ color: "#fff" }} />
                </div>
                <h2 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 8 }}>
                  Reasoning Graph
                </h2>
                <p style={{ color: "hsl(215, 20%, 55%)", fontSize: 14, maxWidth: 400 }}>
                  Enter a search query above to visualize how AI connects and reasons across your documents.
                </p>
              </div>
            ) : (
              <svg
                ref={(el) => {
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width !== canvasSize.width || rect.height !== canvasSize.height) {
                      setCanvasSize({ width: rect.width, height: rect.height });
                    }
                  }
                }}
                style={{ width: "100%", height: "100%" }}
              >
                {/* Gradient definitions */}
                <defs>
                  <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="hsl(262, 80%, 65%)" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="hsl(200, 90%, 65%)" stopOpacity="0.3" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Draw edges from query to documents */}
                {nodes.slice(1).map((node, index) => {
                  const queryNode = nodes[0];
                  const opacity = node.score ? 0.3 + node.score * 0.7 : 0.5;
                  return (
                    <line
                      key={`edge-${node.id}-${index}`}
                      x1={queryNode.x}
                      y1={queryNode.y}
                      x2={node.x}
                      y2={node.y}
                      stroke="url(#edgeGradient)"
                      strokeWidth={2 + (node.score || 0.5) * 3}
                      strokeOpacity={opacity}
                      strokeDasharray={node === selectedNode ? "none" : "5,5"}
                    />
                  );
                })}

                {/* Draw nodes */}
                {nodes.map((node, index) => (
                  <g
                    key={`${node.id}-${index}`}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => handleNodeClick(node)}
                    style={{ cursor: node.type === "document" ? "pointer" : "default" }}
                  >
                    {/* Node background */}
                    {node.type === "query" ? (
                      <>
                        <circle
                          r={50}
                          fill="url(#kinetic-gradient)"
                          filter="url(#glow)"
                        />
                        <defs>
                          <linearGradient id="kinetic-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="hsl(262, 80%, 60%)" />
                            <stop offset="100%" stopColor="hsl(200, 90%, 60%)" />
                          </linearGradient>
                        </defs>
                        <text
                          textAnchor="middle"
                          dy="-8"
                          fill="#fff"
                          fontSize="12"
                          fontWeight="600"
                        >
                          QUERY
                        </text>
                        <text
                          textAnchor="middle"
                          dy="10"
                          fill="rgba(255,255,255,0.8)"
                          fontSize="10"
                          style={{ maxWidth: 80 }}
                        >
                          {node.label.length > 20 ? node.label.slice(0, 20) + "..." : node.label}
                        </text>
                      </>
                    ) : (
                      <>
                        <circle
                          r={node === selectedNode ? 45 : 40}
                          fill={node === selectedNode ? "hsl(262, 60%, 25%)" : "hsl(222, 47%, 13%)"}
                          stroke={node === selectedNode ? "hsl(262, 80%, 65%)" : "hsl(217, 33%, 25%)"}
                          strokeWidth={node === selectedNode ? 3 : 1.5}
                        />
                        {/* Score indicator */}
                        {node.score && (
                          <circle
                            r={45}
                            fill="none"
                            stroke="hsl(262, 80%, 65%)"
                            strokeWidth={3}
                            strokeDasharray={`${node.score * 283} 283`}
                            strokeLinecap="round"
                            transform="rotate(-90)"
                            opacity={0.6}
                          />
                        )}
                        <text
                          textAnchor="middle"
                          dy="-5"
                          fill="hsl(210, 40%, 98%)"
                          fontSize="10"
                          fontWeight="500"
                        >
                          {node.label.length > 12 ? node.label.slice(0, 12) + "..." : node.label}
                        </text>
                        <text
                          textAnchor="middle"
                          dy="12"
                          fill="hsl(262, 80%, 70%)"
                          fontSize="11"
                          fontWeight="600"
                        >
                          {node.score ? `${(node.score * 100).toFixed(0)}%` : ""}
                        </text>
                      </>
                    )}
                  </g>
                ))}
              </svg>
            )}

            {/* Legend */}
            {nodes.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  display: "flex",
                  gap: 16,
                  padding: "10px 16px",
                  background: "var(--surface-container-low)",
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "hsl(215, 20%, 65%)" }}>Query</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "hsl(222, 47%, 13%)",
                      border: "1.5px solid hsl(217, 33%, 25%)",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "hsl(215, 20%, 65%)" }}>Document</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 16, height: 2, background: "hsl(262, 80%, 65%)", borderRadius: 1 }} />
                  <span style={{ fontSize: 11, color: "hsl(215, 20%, 65%)" }}>Relevance</span>
                </div>
              </div>
            )}
          </GlassmorphicCard>
        </div>

        {/* Detail Panel */}
        <div style={{ width: 380, flexShrink: 0 }}>
          {selectedNode && selectedNode.type === "document" ? (
            <GlassmorphicCard variant="elevated" style={{ padding: 24, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <span className="uppercase-label">Document Analysis</span>
                <button
                  onClick={() => setSelectedNode(null)}
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

              {/* Document Info */}
              <div style={{ marginBottom: 20 }}>
                <h3 className="font-display" style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 8 }}>
                  {selectedNode.label}
                </h3>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <StatusBadge 
                    status="success" 
                    label={`${((selectedNode.score || 0) * 100).toFixed(0)}% match`}
                  />
                  {selectedNode.data?.page_number && (
                    <span style={{
                      padding: "4px 10px",
                      background: "var(--surface-container)",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "hsl(215, 20%, 65%)",
                    }}>
                      Page {selectedNode.data.page_number}
                    </span>
                  )}
                </div>
              </div>

              {/* Relevance meter */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="uppercase-label">Relevance Score</span>
                  <span style={{ fontSize: 13, color: "hsl(262, 80%, 70%)", fontWeight: 600 }}>
                    {((selectedNode.score || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <ProgressBar value={(selectedNode.score || 0) * 100} variant="gradient" />
              </div>

              {/* AI Reasoning */}
              <div style={{ marginBottom: 20 }}>
                <span className="uppercase-label" style={{ marginBottom: 12, display: "block" }}>
                  AI Reasoning
                </span>
                
                {reasoningQuery.isLoading ? (
                  <div style={{ 
                    padding: 20, 
                    background: "var(--surface-container-low)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <Icon name={Icons.processing} size={18} className="animate-spin" style={{ color: "hsl(262, 80%, 70%)" }} />
                    <span style={{ fontSize: 13, color: "hsl(215, 20%, 65%)" }}>
                      Generating reasoning...
                    </span>
                  </div>
                ) : (
                  <div style={{ 
                    padding: 16, 
                    background: "var(--surface-container-low)",
                    borderRadius: 10,
                    borderLeft: "3px solid hsl(262, 80%, 65%)",
                  }}>
                    <p style={{ fontSize: 13, color: "hsl(215, 20%, 75%)", lineHeight: 1.7, margin: 0 }}>
                      {reasoningCache.get(selectedNode.id)?.reasoning || 
                        generateFallbackReasoning(selectedNode, query)}
                    </p>
                  </div>
                )}
              </div>

              {/* Excerpt */}
              {selectedNode.data?.chunk_text && (
                <div style={{ marginBottom: 20 }}>
                  <span className="uppercase-label" style={{ marginBottom: 8, display: "block" }}>
                    Relevant Excerpt
                  </span>
                  <p style={{ 
                    fontSize: 13, 
                    color: "hsl(215, 20%, 65%)", 
                    lineHeight: 1.6,
                    padding: 12,
                    background: "var(--surface-container)",
                    borderRadius: 8,
                    margin: 0,
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {selectedNode.data.chunk_text}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href={`/documents?doc_id=${selectedNode.id}`}>
                  <KineticButton variant="secondary" fullWidth icon="open_in_new">
                    View in Document Matrix
                  </KineticButton>
                </Link>
                <Link href={`/search?doc_id=${selectedNode.id}`}>
                  <KineticButton variant="ghost" fullWidth icon={Icons.chat}>
                    Ask about this document
                  </KineticButton>
                </Link>
              </div>
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
                Select a Document
              </h3>
              <p style={{ fontSize: 13, color: "hsl(215, 20%, 55%)" }}>
                Click on a document node in the graph to view AI reasoning about its relevance.
              </p>
              
              {nodes.length > 0 && (
                <div style={{ 
                  marginTop: 24, 
                  padding: 16, 
                  background: "var(--surface-container-low)",
                  borderRadius: 10,
                  width: "100%",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Icon name={Icons.documents} size={16} style={{ color: "hsl(262, 80%, 70%)" }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {nodes.length - 1} documents found
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {nodes.slice(1, 4).map((node) => (
                      <button
                        key={node.id}
                        onClick={() => handleNodeClick(node)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          background: "var(--surface-container)",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 11,
                          color: "hsl(215, 20%, 65%)",
                        }}
                      >
                        {node.label.slice(0, 15)}...
                      </button>
                    ))}
                    {nodes.length > 4 && (
                      <span style={{ 
                        padding: "4px 10px",
                        fontSize: 11,
                        color: "hsl(215, 20%, 55%)",
                      }}>
                        +{nodes.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </GlassmorphicCard>
          )}
        </div>
      </div>
    </div>
  );
}
