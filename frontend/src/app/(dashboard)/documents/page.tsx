"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { TopAppBar } from "@/components/layout/top-app-bar";
import { DocumentViewerPanel } from "@/components/document-viewer";
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
import type { 
  Document, 
  PaginatedResponse, 
  UploadResponse, 
  SearchResponse,
  ExtractedTable,
  SummaryResponse,
} from "@/types/api";

export default function DocumentMatrixPage() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("doc_id");
  
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialDocId);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [conflictInfo, setConflictInfo] = useState<{ filename: string; doc_id: string } | null>(null);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const queryClient = useQueryClient();

  // Fetch documents
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.get<PaginatedResponse<Document>>("documents?page_size=50"),
    refetchInterval: 5000,
  });

  // Fetch document excerpts via search when document is selected
  const { data: excerptData, isLoading: excerptLoading } = useQuery({
    queryKey: ["document-excerpts", selectedDocId],
    queryFn: () => selectedDocId 
      ? apiClient.post<SearchResponse>("search", { 
          query: "summary overview main content key points", 
          top_k: 5,
          doc_ids: [selectedDocId]
        })
      : null,
    enabled: !!selectedDocId,
  });

  // Fetch tables for selected document
  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ["tables", selectedDocId],
    queryFn: () => selectedDocId 
      ? apiClient.get<ExtractedTable[]>(`extract/tables/${selectedDocId}`)
      : null,
    enabled: !!selectedDocId,
  });

  // Retry mutation for failed documents
  const retryMutation = useMutation({
    mutationFn: (docId: string) => apiClient.post<UploadResponse>(`ingest/retry/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  // Upload mutation with conflict handling
  const uploadMutation = useMutation({
    mutationFn: (file: File) => apiClient.upload<UploadResponse>("ingest/upload", file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: any) => {
      if (error.isConflict) {
        // Check the existing document's status
        if (error.existingStatus === "completed") {
          // Show popup for completed documents
          setConflictInfo({ filename: error.filename, doc_id: error.doc_id });
        } else {
          // Auto-retry for queued/processing/failed documents
          if (error.doc_id) {
            retryMutation.mutate(error.doc_id);
          }
        }
      }
    },
  });

  // Classify mutation
  const classifyMutation = useMutation({
    mutationFn: (docId: string) => apiClient.post<{ pdf_type: string }>(`summarize/classify/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const documents = docsData?.items || [];
  const filteredDocs = searchFilter
    ? documents.filter(d => d.filename.toLowerCase().includes(searchFilter.toLowerCase()))
    : documents;

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  // Set initial selection from URL
  useEffect(() => {
    if (initialDocId && !selectedDocId) {
      setSelectedDocId(initialDocId);
    }
  }, [initialDocId, selectedDocId]);

  return (
    <>
      <TopAppBar 
        actions={
          <KineticButton 
            variant="primary" 
            icon={Icons.upload}
            onClick={() => setUploadDialogOpen(true)}
          >
            Upload
          </KineticButton>
        }
      />

      <div 
        style={{ 
          display: "grid", 
          gridTemplateColumns: selectedDocId ? "1fr 1fr" : "1fr", 
          gap: 24,
          minHeight: "calc(100vh - 180px)",
        }}
      >
        {/* Left Panel: Document List / Viewer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Document List Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <KineticInput
              icon={Icons.search}
              placeholder="Filter documents..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13, color: "hsl(215, 20%, 55%)" }}>
              {filteredDocs.length} documents
            </span>
          </div>

          {/* Document List */}
          <div 
            style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: 8,
              flex: 1,
              overflowY: "auto",
            }}
          >
            {docsLoading ? (
              Array.from({ length: 5 }).map((_, i) => <DocumentSkeleton key={i} />)
            ) : filteredDocs.length === 0 ? (
              <EmptyState onUpload={() => setUploadDialogOpen(true)} />
            ) : (
              filteredDocs.map((doc) => (
                <DocumentListItem
                  key={doc.id}
                  doc={doc}
                  selected={doc.id === selectedDocId}
                  onSelect={() => setSelectedDocId(doc.id === selectedDocId ? null : doc.id)}
                  onRetry={doc.status === "failed" ? () => retryMutation.mutate(doc.id) : undefined}
                  retrying={retryMutation.isPending && retryMutation.variables === doc.id}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Intelligence Matrix */}
        {selectedDocId && selectedDoc && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Document Header */}
            <GlassmorphicCard variant="elevated" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div
                  className="gradient-glow"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon 
                    name={selectedDoc.filename.endsWith(".pdf") ? Icons.pdf : Icons.doc} 
                    size={28} 
                    style={{ color: "#fff" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 
                    className="font-display"
                    style={{ 
                      fontSize: "1.25rem", 
                      fontWeight: 600,
                      color: "hsl(210, 40%, 98%)",
                      marginBottom: 8,
                    }}
                  >
                    {selectedDoc.filename}
                  </h2>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <MetaChip icon="calendar_today" value={formatDate(selectedDoc.created_at)} />
                    <MetaChip icon="description" value={`${selectedDoc.page_count} pages`} />
                    <MetaChip icon="storage" value={formatBytes(selectedDoc.file_size)} />
                    {selectedDoc.parser_used && (
                      <MetaChip icon="settings" value={selectedDoc.parser_used} />
                    )}
                  </div>
                </div>
                <StatusBadge status={selectedDoc.status as any} />
              </div>

              {/* Classification */}
              {selectedDoc.status === "completed" && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--surface-container-high)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span className="uppercase-label">Document Type</span>
                      <p style={{ fontSize: 15, fontWeight: 500, color: "hsl(210, 40%, 98%)", marginTop: 4 }}>
                        {selectedDoc.pdf_type || "Unclassified"}
                      </p>
                    </div>
                    {!selectedDoc.pdf_type && (
                      <KineticButton
                        variant="ghost"
                        size="sm"
                        icon={Icons.analyze}
                        loading={classifyMutation.isPending}
                        onClick={() => classifyMutation.mutate(selectedDoc.id)}
                      >
                        Classify
                      </KineticButton>
                    )}
                  </div>
                </div>
              )}
            </GlassmorphicCard>

            {/* Content Excerpts */}
            {selectedDoc.status === "completed" && (
              <GlassmorphicCard style={{ padding: 24, flex: 1, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span className="uppercase-label">Content Excerpts</span>
                  {excerptLoading && <Icon name={Icons.processing} size={16} className="animate-spin" />}
                </div>

                {excerptData?.results && excerptData.results.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {excerptData.results.map((hit, i) => (
                      <div
                        key={i}
                        style={{
                          padding: 16,
                          background: "var(--surface-container-low)",
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          {hit.page_number && (
                            <span 
                              style={{ 
                                fontSize: 11, 
                                padding: "2px 8px",
                                background: "var(--surface-container-high)",
                                borderRadius: 4,
                                color: "hsl(215, 20%, 65%)",
                              }}
                            >
                              Page {hit.page_number}
                            </span>
                          )}
                          <SemanticDensityBar density={hit.score} label="Relevance" />
                        </div>
                        <p style={{ fontSize: 13, color: "hsl(215, 20%, 75%)", lineHeight: 1.6 }}>
                          {hit.chunk_text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : !excerptLoading ? (
                  <p style={{ fontSize: 13, color: "hsl(215, 20%, 55%)", textAlign: "center", padding: 20 }}>
                    No content excerpts available
                  </p>
                ) : null}
              </GlassmorphicCard>
            )}

            {/* Tables Panel */}
            {selectedDoc.status === "completed" && (
              <GlassmorphicCard style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span className="uppercase-label">Extracted Tables</span>
                  <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
                    {tablesData?.length || 0} tables
                  </span>
                </div>

                {tablesLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                    <Icon name={Icons.processing} size={20} className="animate-spin" />
                  </div>
                ) : tablesData && tablesData.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tablesData.slice(0, 3).map((table, i) => (
                      <div
                        key={table.id || i}
                        style={{
                          padding: 12,
                          background: "var(--surface-container-low)",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Icon name={Icons.table} size={18} style={{ color: "hsl(262, 80%, 70%)" }} />
                          <span style={{ fontSize: 13, color: "hsl(210, 40%, 98%)" }}>
                            Table {i + 1} • Page {table.page_number}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)" }}>
                          {table.row_count} × {table.column_count}
                        </span>
                      </div>
                    ))}
                    {tablesData.length > 3 && (
                      <span style={{ fontSize: 12, color: "hsl(215, 20%, 55%)", textAlign: "center" }}>
                        +{tablesData.length - 3} more tables
                      </span>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "hsl(215, 20%, 55%)", textAlign: "center" }}>
                    No tables detected
                  </p>
                )}
              </GlassmorphicCard>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              <KineticButton 
                variant="primary" 
                icon="visibility"
                fullWidth
                onClick={() => setViewingDoc(selectedDoc)}
                disabled={selectedDoc.status !== "completed"}
              >
                View Document
              </KineticButton>
              <KineticButton 
                variant="secondary" 
                icon={Icons.search}
                fullWidth
                onClick={() => window.location.href = `/search?doc_id=${selectedDoc.id}`}
              >
                Search
              </KineticButton>
              <KineticButton 
                variant="secondary" 
                icon={Icons.graph}
                fullWidth
                onClick={() => window.location.href = `/graph?doc_id=${selectedDoc.id}`}
              >
                Graph
              </KineticButton>
            </div>
          </div>
        )}
      </div>

      {/* Document Viewer Panel */}
      {viewingDoc && (
        <div
          style={{
            position: "fixed",
            top: 64, // below TopAppBar
            left: 260, // account for sidebar
            right: 0,
            bottom: 0,
            zIndex: 40,
            background: "var(--background)",
          }}
        >
          <DocumentViewerPanel
            document={viewingDoc}
            onClose={() => setViewingDoc(null)}
            defaultMode="panel"
          />
        </div>
      )}

      {/* Upload Dialog */}
      {uploadDialogOpen && (
        <UploadDialog
          onClose={() => setUploadDialogOpen(false)}
          onUpload={(file) => uploadMutation.mutate(file)}
          uploading={uploadMutation.isPending}
        />
      )}

      {/* Conflict Popup */}
      {conflictInfo && (
        <ConflictPopup
          filename={conflictInfo.filename}
          onClose={() => setConflictInfo(null)}
          onViewDocument={() => {
            setSelectedDocId(conflictInfo.doc_id);
            setConflictInfo(null);
          }}
        />
      )}
    </>
  );
}

// Document List Item
function DocumentListItem({ 
  doc, 
  selected, 
  onSelect,
  onRetry,
  retrying,
}: { 
  doc: Document; 
  selected: boolean; 
  onSelect: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <GlassmorphicCard
      variant={selected ? "elevated" : "default"}
      hoverable
      onClick={onSelect}
      style={{
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        ...(selected && {
          background: "linear-gradient(135deg, hsl(262 80% 65% / 0.15), hsl(200 90% 65% / 0.08))",
        }),
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: selected 
            ? "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))"
            : "var(--surface-container-high)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon 
          name={doc.filename.endsWith(".pdf") ? Icons.pdf : Icons.doc} 
          size={20}
          style={{ color: selected ? "#fff" : "hsl(215, 20%, 65%)" }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 14,
          fontWeight: 500,
          color: "hsl(210, 40%, 98%)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {doc.filename}
        </p>
        <p style={{ fontSize: 12, color: "hsl(215, 20%, 55%)", marginTop: 2 }}>
          {doc.page_count} pages • {formatBytes(doc.file_size)}
        </p>
      </div>
      {onRetry ? (
        <KineticButton
          variant="ghost"
          size="sm"
          icon={retrying ? Icons.processing : "refresh"}
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          disabled={retrying}
        >
          {retrying ? "Retrying..." : "Retry"}
        </KineticButton>
      ) : (
        <StatusBadge status={doc.status as any} size="sm" showIcon={false} />
      )}
    </GlassmorphicCard>
  );
}

// Meta Chip
function MetaChip({ icon, value }: { icon: string; value: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: "var(--surface-container)",
        borderRadius: 6,
        fontSize: 12,
        color: "hsl(215, 20%, 65%)",
      }}
    >
      <Icon name={icon} size={14} />
      {value}
    </span>
  );
}

// Skeleton
function DocumentSkeleton() {
  return (
    <GlassmorphicCard style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-container-high)" }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: "70%", height: 14, borderRadius: 4, background: "var(--surface-container-high)", marginBottom: 8 }} />
        <div style={{ width: "40%", height: 12, borderRadius: 4, background: "var(--surface-container)" }} />
      </div>
    </GlassmorphicCard>
  );
}

// Empty State
function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <GlassmorphicCard style={{ padding: 48, textAlign: "center" }}>
      <Icon name="folder_open" size={48} style={{ color: "hsl(215, 20%, 45%)", marginBottom: 16 }} />
      <h3 className="font-display" style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 8 }}>
        No documents yet
      </h3>
      <p style={{ color: "hsl(215, 20%, 65%)", marginBottom: 24, fontSize: 14 }}>
        Upload your first PDF or DOCX to get started
      </p>
      <KineticButton variant="primary" icon={Icons.upload} onClick={onUpload}>
        Upload Document
      </KineticButton>
    </GlassmorphicCard>
  );
}

// Upload Dialog
function UploadDialog({
  onClose,
  onUpload,
  uploading,
}: {
  onClose: () => void;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      for (const file of accepted) {
        onUpload(file);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      "application/pdf": [".pdf"], 
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] 
    },
    maxSize: 50 * 1024 * 1024,
    multiple: true,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <GlassmorphicCard
        variant="elevated"
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in"
        style={{ width: 500, padding: 32 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 className="font-display" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Upload Documents
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "var(--surface-container)",
              border: "none",
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={Icons.close} size={18} style={{ color: "hsl(215, 20%, 65%)" }} />
          </button>
        </div>

        <div
          {...getRootProps()}
          style={{
            padding: "48px 24px",
            borderRadius: 12,
            textAlign: "center",
            cursor: uploading ? "not-allowed" : "pointer",
            background: isDragActive ? "hsl(262 80% 65% / 0.1)" : "var(--surface-container-low)",
            transition: "all 0.2s",
          }}
          className={isDragActive ? "gradient-border" : ""}
        >
          <input {...getInputProps()} disabled={uploading} />
          <Icon 
            name={isDragActive ? "download" : "cloud_upload"} 
            size={48} 
            style={{ color: isDragActive ? "hsl(262, 80%, 70%)" : "hsl(215, 20%, 55%)", marginBottom: 16 }}
          />
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6, color: "hsl(210, 40%, 98%)" }}>
            {isDragActive ? "Drop files here" : "Drag & drop or click to browse"}
          </p>
          <p style={{ color: "hsl(215, 20%, 55%)", fontSize: 13 }}>
            PDF and DOCX • up to 50MB each
          </p>
          {uploading && (
            <div style={{ marginTop: 16 }}>
              <ProgressBar value={65} variant="gradient" size="md" />
              <p style={{ marginTop: 8, fontSize: 13, color: "hsl(262, 80%, 75%)" }}>
                Uploading...
              </p>
            </div>
          )}
        </div>
      </GlassmorphicCard>
    </div>
  );
}

// Conflict Popup Component
function ConflictPopup({ 
  filename, 
  onClose, 
  onViewDocument 
}: { 
  filename: string; 
  onClose: () => void; 
  onViewDocument: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <GlassmorphicCard
        variant="elevated"
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in"
        style={{ width: 420, padding: 32 }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "hsl(45 90% 50% / 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <Icon name="info" size={32} style={{ color: "hsl(45, 90%, 60%)" }} />
          </div>
          
          <h2 className="font-display" style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: 12 }}>
            File Already Processed
          </h2>
          
          <p style={{ color: "hsl(215, 20%, 65%)", fontSize: 14, marginBottom: 8 }}>
            This document has already been successfully processed:
          </p>
          
          <p style={{ 
            color: "hsl(210, 40%, 98%)", 
            fontSize: 14, 
            fontWeight: 500,
            padding: "12px 16px",
            background: "var(--surface-container-low)",
            borderRadius: 8,
            marginBottom: 24,
            wordBreak: "break-all"
          }}>
            {filename}
          </p>
          
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                background: "var(--surface-container)",
                border: "1px solid hsl(215, 20%, 25%)",
                color: "hsl(215, 20%, 75%)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Close
            </button>
            <button
              onClick={onViewDocument}
              className="btn-primary-gradient"
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              View Document
            </button>
          </div>
        </div>
      </GlassmorphicCard>
    </div>
  );
}

// Helpers
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
