/**
 * DocumentViewerPanel — Main container with file type routing and chat integration
 * Supports panel mode (in-page) and modal mode (fullscreen overlay)
 */
"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { DOCXViewer } from "./DOCXViewer";
import { TXTViewer } from "./TXTViewer";
import { DocumentSearchBar } from "./DocumentSearchBar";
import { ViewerModeToggle, ViewerMode } from "./ViewerModeToggle";
import { DocumentChatPanel } from "@/components/chat/DocumentChatPanel";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";
import { KineticButton } from "@/components/ui/kinetic-button";
import { Icon } from "@/components/ui/icon";
import type { Document } from "@/types/api";

// Dynamic import PDFViewer to avoid SSR issues with react-pdf
const PDFViewer = dynamic(() => import("./PDFViewer").then((mod) => mod.PDFViewer), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="text-sm text-slate-400">Loading PDF viewer...</span>
    </div>
  ),
});

interface DocumentViewerPanelProps {
  document: Document;
  onClose: () => void;
  defaultMode?: ViewerMode;
  initialPage?: number;
}

type FileType = "pdf" | "docx" | "txt" | "unknown";

function getFileType(filename: string): FileType {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "docx":
    case "doc":
      return "docx";
    case "txt":
    case "md":
    case "rtf":
      return "txt";
    default:
      return "unknown";
  }
}

export function DocumentViewerPanel({
  document,
  onClose,
  defaultMode = "panel",
  initialPage,
}: DocumentViewerPanelProps) {
  const [mode, setMode] = useState<ViewerMode>(defaultMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const [totalPages, setTotalPages] = useState(document.page_count || 1);

  const fileType = getFileType(document.filename);

  // Handle text selection from viewers
  const handleTextSelect = useCallback((text: string) => {
    setSelectedText(text);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape" && mode === "modal") {
        onClose();
        return;
      }
      // Ctrl/Cmd + F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        // Search bar will auto-focus
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, onClose]);

  // Render the viewer based on file type
  const renderViewer = () => {
    switch (fileType) {
      case "pdf":
        return (
          <PDFViewer
            docId={document.id}
            filename={document.filename}
            searchQuery={searchQuery}
            onTextSelect={handleTextSelect}
            onPageChange={handlePageChange}
            initialPage={initialPage}
          />
        );
      case "docx":
        return (
          <DOCXViewer
            docId={document.id}
            filename={document.filename}
            searchQuery={searchQuery}
            onTextSelect={handleTextSelect}
          />
        );
      case "txt":
        return (
          <TXTViewer
            docId={document.id}
            filename={document.filename}
            searchQuery={searchQuery}
            onTextSelect={handleTextSelect}
          />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Icon name="description" size={64} className="text-slate-600" />
            <span className="text-slate-400">
              Unsupported file type: {document.filename}
            </span>
          </div>
        );
    }
  };

  // Panel content
  const panelContent = (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/5"
        style={{ background: "rgba(19, 28, 43, 0.95)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            name={
              fileType === "pdf"
                ? "picture_as_pdf"
                : fileType === "docx"
                ? "article"
                : "description"
            }
            size={24}
            className="text-primary shrink-0"
          />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white truncate">
              {document.filename}
            </h3>
            <p className="text-xs text-slate-400">
              {totalPages} pages •{" "}
              {(document.file_size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ViewerModeToggle mode={mode} onChange={setMode} />
          <KineticButton
            variant={showChat ? "secondary" : "ghost"}
            size="sm"
            icon="chat"
            onClick={() => setShowChat(!showChat)}
          >
            Chat
          </KineticButton>
          <KineticButton
            variant="ghost"
            size="sm"
            icon="close"
            onClick={onClose}
          >
            Close
          </KineticButton>
        </div>
      </div>

      {/* Search Bar */}
      <DocumentSearchBar
        onSearch={setSearchQuery}
        placeholder={`Search in ${document.filename}...`}
      />

      {/* Content Area */}
      <div className="flex flex-1 min-h-0">
        {/* Document Viewer */}
        <div className={`flex flex-col flex-1 min-w-0 min-h-0 ${showChat ? "border-r border-white/5" : ""}`}>
          {renderViewer()}
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="w-96 shrink-0">
            <DocumentChatPanel
              docId={document.id}
              filename={document.filename}
              selectedText={selectedText}
              currentPage={currentPage}
              onClearSelection={() => setSelectedText(null)}
            />
          </div>
        )}
      </div>
    </div>
  );

  // Panel mode: render inline
  if (mode === "panel") {
    return (
      <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: "rgba(19, 28, 43, 0.8)", backdropFilter: "blur(12px)" }}>
        {panelContent}
      </div>
    );
  }

  // Modal mode: render as fullscreen overlay via portal
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.8)" }}
    >
      <div
        className="w-[95vw] h-[95vh] rounded-2xl flex flex-col"
        style={{
          background: "rgba(11, 19, 35, 0.98)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        {panelContent}
      </div>
    </div>,
    globalThis.document.body
  );
}
