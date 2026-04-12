"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { apiClient } from "@/lib/api-client";
import type { Document, PaginatedResponse, UploadResponse } from "@/types/api";

export default function DocumentsPage() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.get<PaginatedResponse<Document>>("documents"),
    refetchInterval: 5000, // Poll for status updates
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      apiClient.upload<UploadResponse>("ingest/upload", file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  return (
    <div className="animate-slide-in">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginBottom: 4,
              color: "hsl(210, 40%, 98%)",
            }}
          >
            Documents
          </h1>
          <p style={{ color: "hsl(215, 20%, 65%)", fontSize: 14 }}>
            {data?.total || 0} documents ingested
          </p>
        </div>
        <button
          onClick={() => setUploadDialogOpen(true)}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            background:
              "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ＋ Upload
        </button>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data?.items?.length === 0 ? (
        <EmptyState onUpload={() => setUploadDialogOpen(true)} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data?.items?.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
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
    </div>
  );
}

function DocumentCard({ doc }: { doc: Document }) {
  return (
    <div
      className="glass"
      style={{
        padding: "18px 24px",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 16,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(255,255,255,0.07)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(255,255,255,0.04)";
      }}
    >
      <div style={{ fontSize: 28 }}>
        {doc.filename.endsWith(".pdf") ? "📕" : "📘"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontWeight: 600,
            fontSize: 15,
            color: "hsl(210, 40%, 98%)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {doc.filename}
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 4,
            fontSize: 12,
            color: "hsl(215, 20%, 65%)",
          }}
        >
          <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
          <span>•</span>
          <span>{doc.page_count} pages</span>
          {doc.parser_used && (
            <>
              <span>•</span>
              <span>{doc.parser_used}</span>
            </>
          )}
        </div>
      </div>
      <StatusBadge status={doc.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    queued: { label: "Queued", className: "status-queued" },
    processing: { label: "Processing…", className: "status-processing" },
    completed: { label: "Ready", className: "status-completed" },
    failed: { label: "Failed", className: "status-failed" },
  };
  const { label, className } = config[status] || {
    label: status,
    className: "",
  };

  return (
    <span
      className={className}
      style={{
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div
      className="glass"
      style={{
        padding: 60,
        borderRadius: 16,
        textAlign: "center",
        borderStyle: "dashed",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "hsl(210, 40%, 90%)",
          marginBottom: 8,
        }}
      >
        No documents yet
      </h3>
      <p style={{ color: "hsl(215, 20%, 65%)", marginBottom: 24, fontSize: 14 }}>
        Upload your first PDF or DOCX to get started
      </p>
      <button
        onClick={onUpload}
        style={{
          padding: "10px 24px",
          borderRadius: 8,
          border: "1px solid hsl(262 80% 65% / 0.4)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          background: "hsl(262 80% 65% / 0.1)",
          color: "hsl(262,80%,75%)",
        }}
      >
        Upload Document
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="glass"
      style={{
        padding: "18px 24px",
        borderRadius: 12,
        display: "flex",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: "hsl(217, 33%, 20%)",
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            height: 14,
            width: "60%",
            borderRadius: 4,
            background: "hsl(217, 33%, 20%)",
            marginBottom: 8,
          }}
        />
        <div
          style={{
            height: 11,
            width: "30%",
            borderRadius: 4,
            background: "hsl(217, 33%, 17%)",
          }}
        />
      </div>
    </div>
  );
}

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
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxSize: 50 * 1024 * 1024,
    multiple: true,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass animate-slide-in"
        style={{ width: 480, borderRadius: 16, padding: 32 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Upload Documents</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "hsl(215, 20%, 65%)",
            }}
          >
            ✕
          </button>
        </div>

        <div
          {...getRootProps()}
          style={{
            border: `2px dashed ${isDragActive ? "hsl(262,80%,65%)" : "hsl(217, 33%, 25%)"}`,
            borderRadius: 12,
            padding: "40px 24px",
            textAlign: "center",
            cursor: uploading ? "not-allowed" : "pointer",
            background: isDragActive ? "hsl(262 80% 65% / 0.05)" : "transparent",
            transition: "all 0.2s",
          }}
        >
          <input {...getInputProps()} disabled={uploading} />
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {isDragActive ? "📥" : "📤"}
          </div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
            {isDragActive ? "Drop files here" : "Drag & drop files or click to browse"}
          </p>
          <p style={{ color: "hsl(215, 20%, 65%)", fontSize: 13 }}>
            PDF and DOCX — up to 50MB each
          </p>
          {uploading && (
            <p
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "hsl(262, 80%, 75%)",
              }}
            >
              Uploading…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
