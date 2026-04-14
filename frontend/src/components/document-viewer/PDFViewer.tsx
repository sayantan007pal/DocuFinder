/**
 * PDFViewer — Scrollable PDF viewer with zoom and page navigation
 * Uses react-pdf with PDF.js under the hood
 * IMPORTANT: This component must be dynamically imported with ssr: false
 */
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

  if (!pdfLib || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-slate-400">
          {!pdfLib ? "Loading PDF viewer..." : `Loading ${filename}...`}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Icon name="error" size={48} className="text-red-400" />
        <span className="text-sm text-red-400">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-white/5"
        style={{ background: "rgba(19, 28, 43, 0.9)" }}
      >
        <div className="flex items-center gap-2">
          <KineticButton
            variant="ghost"
            size="sm"
            icon="remove"
            onClick={zoomOut}
            disabled={scale <= 0.5}
          >
            Zoom Out
          </KineticButton>
          <span className="text-sm text-slate-400 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <KineticButton
            variant="ghost"
            size="sm"
            icon="add"
            onClick={zoomIn}
            disabled={scale >= 3.0}
          >
            Zoom In
          </KineticButton>
          <KineticButton variant="ghost" size="sm" onClick={zoomReset}>
            Reset
          </KineticButton>
        </div>

        <div className="flex items-center gap-2">
          <KineticButton
            variant="ghost"
            size="sm"
            icon="keyboard_arrow_up"
            onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </KineticButton>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onBlur={handlePageInputSubmit}
              onKeyDown={(e) => e.key === "Enter" && handlePageInputSubmit()}
              className="w-12 px-2 py-1 text-sm text-center rounded bg-white/5 text-slate-300 outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-sm text-slate-400">of {numPages}</span>
          </div>
          <KineticButton
            variant="ghost"
            size="sm"
            icon="keyboard_arrow_down"
            onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
          >
            Next
          </KineticButton>
        </div>
      </div>

      {/* PDF Pages Container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto p-4"
        onScroll={handleScroll}
        onMouseUp={handleTextSelection}
        style={{
          background: "linear-gradient(180deg, #0b1323 0%, #131c2b 100%)",
        }}
      >
        {fileObject && pdfLib && (
          <pdfLib.Document
            file={fileObject}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center p-8">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            }
            error={
              <div className="flex items-center justify-center p-8 text-red-400">
                Failed to load PDF
              </div>
            }
          >
            <div className="flex flex-col items-center gap-4">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(
                (pageNum) => (
                  <div
                    key={pageNum}
                    ref={(el) => {
                      if (el) pageRefs.current.set(pageNum, el);
                    }}
                    className="shadow-2xl"
                    style={{
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <pdfLib.Page
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="bg-white"
                      loading={
                        <div
                          className="flex items-center justify-center bg-slate-800"
                          style={{ width: 612 * scale, height: 792 * scale }}
                        >
                          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
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
