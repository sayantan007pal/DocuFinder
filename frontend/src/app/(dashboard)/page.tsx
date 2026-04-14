/**
 * Global Dashboard - Command Center main view
 * Activity feed + corpus metrics
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { TopAppBar } from "@/components/layout/top-app-bar";
import { 
  Icon, 
  Icons, 
  GlassmorphicCard, 
  MetricCard, 
  StatusBadge, 
  StatusAccent,
  ProgressBar,
  KineticButton,
} from "@/components/ui";
import type { Document, PaginatedResponse, HealthStatus } from "@/types/api";
import Link from "next/link";

export default function DashboardPage() {
  // Fetch recent documents for activity feed
  const { data: documentsData, isLoading: docsLoading } = useQuery({
    queryKey: ["documents", "recent"],
    queryFn: () => apiClient.get<PaginatedResponse<Document>>("documents?page=1&page_size=10"),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Fetch health status for metrics
  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiClient.get<HealthStatus>("health"),
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const documents = documentsData?.items || [];
  const totalDocs = documentsData?.total || 0;

  // Calculate status counts
  const statusCounts = documents.reduce(
    (acc, doc) => {
      acc[doc.status] = (acc[doc.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate total file size
  const totalSize = documents.reduce((sum, doc) => sum + doc.file_size, 0);
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <>
      <TopAppBar />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24 }}>
        {/* Left: Activity Feed */}
        <div>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between",
            marginBottom: 20,
          }}>
            <div>
              <h2 className="font-display" style={{ 
                fontSize: "1.25rem", 
                fontWeight: 600,
                color: "hsl(210, 40%, 98%)",
                margin: 0,
              }}>
                Activity Stream
              </h2>
              <p style={{ fontSize: 13, color: "hsl(215, 20%, 55%)", margin: "4px 0 0 0" }}>
                Real-time document processing feed
              </p>
            </div>
            <Link href="/documents">
              <KineticButton variant="ghost" size="sm" icon={Icons.expand}>
                View All
              </KineticButton>
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {docsLoading ? (
              // Skeleton loaders
              Array.from({ length: 5 }).map((_, i) => (
                <GlassmorphicCard key={i} style={{ padding: 20 }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div 
                      style={{ 
                        width: 40, 
                        height: 40, 
                        borderRadius: 10, 
                        background: "var(--surface-container-high)",
                        animation: "pulse 2s infinite",
                      }} 
                    />
                    <div style={{ flex: 1 }}>
                      <div 
                        style={{ 
                          width: "60%", 
                          height: 16, 
                          borderRadius: 4,
                          background: "var(--surface-container-high)",
                          marginBottom: 8,
                          animation: "pulse 2s infinite",
                        }} 
                      />
                      <div 
                        style={{ 
                          width: "40%", 
                          height: 12, 
                          borderRadius: 4,
                          background: "var(--surface-container)",
                          animation: "pulse 2s infinite",
                        }} 
                      />
                    </div>
                  </div>
                </GlassmorphicCard>
              ))
            ) : documents.length === 0 ? (
              <GlassmorphicCard style={{ padding: 40, textAlign: "center" }}>
                <Icon name="inbox" size={48} style={{ color: "hsl(215, 20%, 45%)", marginBottom: 16 }} />
                <p style={{ color: "hsl(215, 20%, 65%)", marginBottom: 16 }}>
                  No documents yet. Upload your first document to get started.
                </p>
                <Link href="/documents">
                  <KineticButton variant="primary" icon={Icons.upload}>
                    Upload Document
                  </KineticButton>
                </Link>
              </GlassmorphicCard>
            ) : (
              documents.map((doc) => (
                <ActivityFeedItem key={doc.id} document={doc} />
              ))
            )}
          </div>
        </div>

        {/* Right: Corpus Metrics */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <h2 className="font-display" style={{ 
              fontSize: "1.25rem", 
              fontWeight: 600,
              color: "hsl(210, 40%, 98%)",
              margin: "0 0 20px 0",
            }}>
              Corpus Metrics
            </h2>
          </div>

          {/* Total Documents */}
          <MetricCard
            label="Total Documents"
            value={totalDocs}
            icon={Icons.documents}
            trend={totalDocs > 0 ? { value: 12, direction: "up" } : undefined}
            secondaryValue={formatBytes(totalSize)}
          />

          {/* Processing Status */}
          <GlassmorphicCard style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <span className="uppercase-label">Processing Status</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <StatusRow 
                label="Completed" 
                count={statusCounts.completed || 0} 
                total={totalDocs} 
                status="completed" 
              />
              <StatusRow 
                label="Processing" 
                count={statusCounts.processing || 0} 
                total={totalDocs} 
                status="processing" 
              />
              <StatusRow 
                label="Queued" 
                count={statusCounts.queued || 0} 
                total={totalDocs} 
                status="queued" 
              />
              <StatusRow 
                label="Failed" 
                count={statusCounts.failed || 0} 
                total={totalDocs} 
                status="failed" 
              />
            </div>
          </GlassmorphicCard>

          {/* System Health */}
          <GlassmorphicCard style={{ padding: 24 }}>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between",
              marginBottom: 16,
            }}>
              <span className="uppercase-label">System Health</span>
              <StatusBadge 
                status={healthData?.status === "healthy" ? "completed" : "queued"} 
                label={healthData?.status || "Unknown"}
                size="sm"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {healthData?.services && Object.entries(healthData.services).map(([service, healthy]) => (
                <ServiceStatus key={service} name={service} healthy={healthy} />
              ))}
            </div>
          </GlassmorphicCard>

          {/* Quick Actions */}
          <GlassmorphicCard style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <span className="uppercase-label">Quick Actions</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href="/documents" style={{ textDecoration: "none" }}>
                <KineticButton variant="secondary" fullWidth icon={Icons.upload}>
                  Upload Documents
                </KineticButton>
              </Link>
              <Link href="/search" style={{ textDecoration: "none" }}>
                <KineticButton variant="secondary" fullWidth icon={Icons.search}>
                  Search Corpus
                </KineticButton>
              </Link>
              <Link href="/graph" style={{ textDecoration: "none" }}>
                <KineticButton variant="secondary" fullWidth icon={Icons.graph}>
                  Analyze Reasoning
                </KineticButton>
              </Link>
            </div>
          </GlassmorphicCard>
        </div>
      </div>
    </>
  );
}

// Activity Feed Item Component
function ActivityFeedItem({ document }: { document: Document }) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return Icons.success;
      case "processing": return Icons.processing;
      case "failed": return Icons.error;
      default: return Icons.pending;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <GlassmorphicCard 
      hoverable 
      style={{ 
        padding: 0, 
        display: "flex",
        overflow: "hidden",
      }}
    >
      <StatusAccent status={document.status as any} />
      <div style={{ padding: "16px 20px", flex: 1, display: "flex", gap: 16 }}>
        {/* Icon */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: document.status === "completed" 
              ? "hsl(142 76% 50% / 0.15)"
              : document.status === "processing"
              ? "hsl(200 90% 65% / 0.15)"
              : document.status === "failed"
              ? "hsl(0 84% 60% / 0.15)"
              : "hsl(38 92% 50% / 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon 
            name={document.filename.endsWith(".pdf") ? Icons.pdf : Icons.doc} 
            size={22}
            style={{
              color: document.status === "completed" 
                ? "hsl(142, 76%, 50%)"
                : document.status === "processing"
                ? "hsl(200, 90%, 65%)"
                : document.status === "failed"
                ? "hsl(0, 84%, 60%)"
                : "hsl(38, 92%, 50%)",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span 
              style={{ 
                fontSize: 14, 
                fontWeight: 500,
                color: "hsl(210, 40%, 98%)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {document.filename}
            </span>
            <StatusBadge status={document.status as any} size="sm" showIcon={false} />
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
            {document.page_count && (
              <span>{document.page_count} pages</span>
            )}
            {document.parser_used && (
              <span>via {document.parser_used}</span>
            )}
            <span>{formatTime(document.created_at)}</span>
          </div>

          {/* Progress bar for processing */}
          {document.status === "processing" && (
            <div style={{ marginTop: 12 }}>
              <ProgressBar value={65} variant="gradient" size="sm" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {document.status === "completed" && (
            <Link href={`/documents?doc_id=${document.id}`}>
              <button
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--surface-container)",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(215, 20%, 65%)",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface-container-high)";
                  e.currentTarget.style.color = "hsl(210, 40%, 98%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--surface-container)";
                  e.currentTarget.style.color = "hsl(215, 20%, 65%)";
                }}
              >
                <Icon name="visibility" size={16} />
                View
              </button>
            </Link>
          )}
          {document.status === "failed" && (
            <button
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "hsl(0 84% 60% / 0.15)",
                border: "none",
                cursor: "pointer",
                color: "hsl(0, 84%, 70%)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="refresh" size={16} />
              Retry
            </button>
          )}
        </div>
      </div>
    </GlassmorphicCard>
  );
}

// Status Row for metrics
function StatusRow({ 
  label, 
  count, 
  total, 
  status 
}: { 
  label: string; 
  count: number; 
  total: number;
  status: "completed" | "processing" | "queued" | "failed";
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const variants: Record<string, "success" | "warning" | "error" | "default"> = {
    completed: "success",
    processing: "default",
    queued: "warning",
    failed: "error",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "hsl(215, 20%, 65%)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(210, 40%, 98%)" }}>{count}</span>
      </div>
      <ProgressBar value={percentage} variant={variants[status]} size="sm" />
    </div>
  );
}

// Service Status for health check
function ServiceStatus({ name, healthy }: { name: string; healthy: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      background: "var(--surface-container-low)",
      borderRadius: 8,
    }}>
      <span style={{ 
        fontSize: 13, 
        color: "hsl(215, 20%, 65%)",
        textTransform: "capitalize",
      }}>
        {name}
      </span>
      <Icon 
        name={healthy ? "check_circle" : "cancel"} 
        size={18} 
        filled
        style={{ 
          color: healthy ? "hsl(142, 76%, 50%)" : "hsl(0, 84%, 60%)" 
        }}
      />
    </div>
  );
}
