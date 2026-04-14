/**
 * PDFViewer — Scrollable PDF viewer with zoom and page navigation
 * Command Center design with polished toolbar
 * IMPORTANT: This component must be dynamically imported with ssr: false
 */
"use client";

import { useState, useEffect, useCallback, useRef, useMemo, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";
import { fetchDocumentFile } from "@/lib/api-client";

// Types for react-pdf components
type ReactPdfModule = typeof import("react-pdf");

interface PDFViewerProps {
  docId: string;
  filename: string;
  searchQuery?: string;
  onTextSelect?: (text: string) => void;
  onPageChange?: (page: number, totalPages: number) => void;
  initialPage?: number;
}

export function PDFViewer({
  docId,
  filename,
  searchQuery,
  onTextSelect,
  onPageChange,
  initialPage = 1,
}: PDFViewerProps) {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState<string>(String(initialPage));
  const [pdfLib, setPdfLib] = useState<ReactPdfModule | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const initialScrollDone = useRef(false);

  // Memoize file object to prevent unnecessary re-renders
  const fileObject = useMemo(
    () => (pdfData ? { data: pdfData } : null),
    [pdfData]
  );

  // Load react-pdf library on client side only
  useEffect(() => {
    import("react-pdf").then((mod) => {
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
      setPdfLib(mod);
    });
  }, []);

  // Fetch PDF file
  useEffect(() => {
    if (!pdfLib) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDocumentFile(docId)
      .then((blob) => blob.arrayBuffer())
      .then((buffer) => {
        if (!cancelled) {
          setPdfData(buffer);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [docId, pdfLib]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      const startPage = Math.min(Math.max(1, initialPage), numPages);
      onPageChange?.(startPage, numPages);
      
      // Scroll to initial page after a short delay
      if (!initialScrollDone.current && initialPage > 1) {
        setTimeout(() => {
          scrollToPage(startPage);
          initialScrollDone.current = true;
        }, 300);
      }
    },
    [onPageChange, initialPage]
  );

  // Scroll to page
  const scrollToPage = useCallback((page: number) => {
    const pageEl = pageRefs.current.get(page);
    if (pageEl && containerRef.current) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setCurrentPage(page);
    setPageInputValue(String(page));
  }, []);

  // Handle page input submit
  const handlePageInputSubmit = useCallback(() => {
    const page = parseInt(pageInputValue, 10);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      scrollToPage(page);
      onPageChange?.(page, numPages);
    } else {
      setPageInputValue(String(currentPage));
    }
  }, [pageInputValue, numPages, currentPage, scrollToPage, onPageChange]);

  // Track current page on scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Find the page that's most visible
    let maxVisibleArea = 0;
    let mostVisiblePage = 1;

    pageRefs.current.forEach((el, pageNum) => {
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, containerRect.top);
      const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
      const visibleArea = Math.max(0, visibleBottom - visibleTop);

      if (visibleArea > maxVisibleArea) {
        maxVisibleArea = visibleArea;
        mostVisiblePage = pageNum;
      }
    });

    if (mostVisiblePage !== currentPage) {
      setCurrentPage(mostVisiblePage);
      setPageInputValue(String(mostVisiblePage));
      onPageChange?.(mostVisiblePage, numPages);
    }
  }, [currentPage, numPages, onPageChange]);

  // Zoom controls
  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3.0));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const zoomReset = () => setScale(1.0);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && onTextSelect) {
      onTextSelect(text);
    }
  }, [onTextSelect]);

  // Styles
  const loadingContainerStyles: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
  };

  const spinnerStyles: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "2px solid rgba(162, 136, 247, 0.3)",
    borderTopColor: "hsl(262, 80%, 70%)",
    animation: "spin 0.8s linear infinite",
  };

  const errorContainerStyles: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
  };

  const toolbarStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    background: "var(--surface-container-low)",
  };

  const zoomLabelStyles: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "hsl(262, 80%, 70%)",
    minWidth: 52,
    textAlign: "center",
    fontFamily: "'JetBrains Mono', monospace",
  };

  const pageInputStyles: CSSProperties = {
    width: 48,
    padding: "6px 8px",
    fontSize: 13,
    fontWeight: 500,
    textAlign: "center",
    borderRadius: 8,
    border: "none",
    outline: "none",
    background: "rgba(255, 255, 255, 0.06)",
    color: "hsl(210, 40%, 98%)",
    fontFamily: "'JetBrains Mono', monospace",
  };

  const pageLabelStyles: CSSProperties = {
    fontSize: 13,
    color: "hsl(215, 20%, 55%)",
  };

  const contentContainerStyles: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: 20,
    background: "var(--surface-base)",
  };

  const pageContainerStyles: CSSProperties = {
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)",
    borderRadius: 6,
    overflow: "hidden",
  };

  if (!pdfLib || loading) {
    return (
      <div style={loadingContainerStyles}>
        <div style={spinnerStyles} />
        <span style={{ fontSize: 13, color: "hsl(215, 20%, 55%)" }}>
          {!pdfLib ? "Loading PDF viewer..." : `Loading ${filename}...`}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={errorContainerStyles}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(0 70% 50% / 0.1)",
        }}>
          <Icon name="error" size={32} style={{ color: "hsl(0, 70%, 60%)" }} />
        </div>
        <span style={{ fontSize: 14, color: "hsl(0, 70%, 60%)" }}>{error}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", minHeight: 0 }}>
      {/* Toolbar */}
      <div style={toolbarStyles}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <KineticButton
            variant="ghost"
            size="sm"
            icon="remove"
            onClick={zoomOut}
            disabled={scale <= 0.5}
          />
          <span style={zoomLabelStyles}>{Math.round(scale * 100)}%</span>
          <KineticButton
            variant="ghost"
            size="sm"
            icon="add"
            onClick={zoomIn}
            disabled={scale >= 3.0}
          />
          <KineticButton variant="ghost" size="sm" onClick={zoomReset}>
            Reset
          </KineticButton>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <KineticButton
            variant="ghost"
            size="sm"
            icon="keyboard_arrow_up"
            onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="text"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onBlur={handlePageInputSubmit}
              onKeyDown={(e) => e.key === "Enter" && handlePageInputSubmit()}
              style={pageInputStyles}
            />
            <span style={pageLabelStyles}>of {numPages}</span>
          </div>
          <KineticButton
            variant="ghost"
            size="sm"
            icon="keyboard_arrow_down"
            onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
          />
        </div>
      </div>

      {/* PDF Pages Container */}
      <div
        ref={containerRef}
        style={contentContainerStyles}
        onScroll={handleScroll}
        onMouseUp={handleTextSelection}
      >
        {fileObject && pdfLib && (
          <pdfLib.Document
            file={fileObject}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
                <div style={spinnerStyles} />
              </div>
            }
            error={
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32, color: "hsl(0, 70%, 60%)" }}>
                Failed to load PDF
              </div>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map(
                (pageNum) => (
                  <div
                    key={pageNum}
                    ref={(el) => {
                      if (el) pageRefs.current.set(pageNum, el);
                    }}
                    style={pageContainerStyles}
                  >
                    <pdfLib.Page
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="bg-white"
                      loading={
                        <div
                          style={{ 
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "hsl(215, 20%, 15%)",
                            width: 612 * scale, 
                            height: 792 * scale,
                          }}
                        >
                          <div style={spinnerStyles} />
                        </div>
                      }
                    />
                  </div>
                )
              )}
            </div>
          </pdfLib.Document>
        )}
      </div>
    </div>
  );
}
