/**
 * DocumentViewerPanel — Main container with file type routing and chat integration
 * Command Center design with TopAppBar-style header
 */
"use client";

import { useState, useCallback, useEffect, CSSProperties } from "react";
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
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center", 
      height: "100%", 
      gap: 16 
    }}>
      <div style={{ 
        width: 32, 
        height: 32, 
        borderRadius: "50%", 
        border: "2px solid rgba(162, 136, 247, 0.3)", 
        borderTopColor: "hsl(262, 80%, 70%)",
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{ fontSize: 13, color: "hsl(215, 20%, 55%)" }}>Loading PDF viewer...</span>
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

function getFileIcon(fileType: FileType): string {
  switch (fileType) {
    case "pdf": return "picture_as_pdf";
    case "docx": return "article";
    default: return "description";
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

  const handleTextSelect = useCallback((text: string) => {
    setSelectedText(text);
  }, []);

  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mode === "modal") {
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, onClose]);

  const renderViewer = () => {
    const unsupportedStyles: CSSProperties = {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 16,
    };

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
          <div style={unsupportedStyles}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255, 255, 255, 0.04)",
            }}>
              <Icon name="description" size={40} style={{ color: "hsl(215, 20%, 45%)" }} />
            </div>
            <span style={{ fontSize: 14, color: "hsl(215, 20%, 55%)" }}>
              Unsupported file type: {document.filename}
            </span>
          </div>
        );
    }
  };

  // Styles
  const headerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "var(--surface-container-low)",
  };

  const headerLeftStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    minWidth: 0,
  };

  const iconContainerStyles: CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, hsl(262, 80%, 70%), hsl(200, 90%, 65%))",
    flexShrink: 0,
  };

  const titleStyles: CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    color: "hsl(210, 40%, 98%)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-space-grotesk), sans-serif",
  };

  const subtitleStyles: CSSProperties = {
    fontSize: 12,
    color: "hsl(215, 20%, 55%)",
    marginTop: 2,
  };

  const headerRightStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const contentAreaStyles: CSSProperties = {
    display: "flex",
    flex: 1,
    minHeight: 0,
  };

  const viewerContainerStyles: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRight: showChat ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
  };

  const chatContainerStyles: CSSProperties = {
    width: 400,
    flexShrink: 0,
    background: "var(--surface-container-low)",
  };

  const panelContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* Header - TopAppBar style */}
      <div style={headerStyles}>
        <div style={headerLeftStyles}>
          <div style={iconContainerStyles}>
            <Icon name={getFileIcon(fileType)} size={22} style={{ color: "white" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={titleStyles}>{document.filename}</h3>
            <p style={subtitleStyles}>
              {totalPages} {totalPages === 1 ? "page" : "pages"} • {(document.file_size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>

        <div style={headerRightStyles}>
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
      <div style={contentAreaStyles}>
        {/* Document Viewer */}
        <div style={viewerContainerStyles}>
          {renderViewer()}
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div style={chatContainerStyles}>
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

  // Panel mode styles
  const panelModeStyles: CSSProperties = {
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--surface-container)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  };

  // Modal mode styles
  const modalOverlayStyles: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.85)",
    backdropFilter: "blur(8px)",
  };

  const modalContainerStyles: CSSProperties = {
    width: "95vw",
    height: "95vh",
    borderRadius: 20,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--surface-base)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    boxShadow: "0 32px 64px -16px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.03)",
  };

  if (mode === "panel") {
    return <div style={panelModeStyles}>{panelContent}</div>;
  }

  return createPortal(
    <div style={modalOverlayStyles}>
      <div style={modalContainerStyles}>
        {panelContent}
      </div>
    </div>,
    globalThis.document.body
  );
}
