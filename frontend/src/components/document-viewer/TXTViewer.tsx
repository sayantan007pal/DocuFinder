/**
 * TXTViewer — Plain text viewer with monospace font
 * Optimized for code, logs, and plain text files
 */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";
import { fetchDocumentText } from "@/lib/api-client";

interface TXTViewerProps {
  docId: string;
  filename: string;
  searchQuery?: string;
  onTextSelect?: (text: string) => void;
}

export function TXTViewer({
  docId,
  filename,
  searchQuery,
  onTextSelect,
}: TXTViewerProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);

  // Fetch text content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDocumentText(docId)
      .then((text) => {
        if (!cancelled) {
          setContent(text);
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
  }, [docId]);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && onTextSelect) {
      onTextSelect(text);
    }
  }, [onTextSelect]);

  // Process lines with optional highlighting
  const lines = useMemo(() => {
    const rawLines = content.split("\n");
    
    if (!searchQuery) {
      return rawLines.map((line) => ({ line, highlighted: false }));
    }

    const regex = new RegExp(`(${searchQuery})`, "gi");
    return rawLines.map((line) => ({
      line: line.replace(
        regex,
        '<mark class="bg-yellow-400/40 text-inherit rounded px-0.5">$1</mark>'
      ),
      highlighted: regex.test(line),
    }));
  }, [content, searchQuery]);

  // Count matches
  const matchCount = useMemo(() => {
    if (!searchQuery) return 0;
    const regex = new RegExp(searchQuery, "gi");
    return (content.match(regex) || []).length;
  }, [content, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading {filename}...</span>
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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-white/5"
        style={{ background: "rgba(19, 28, 43, 0.9)" }}
      >
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            {lines.length} lines • {content.length.toLocaleString()} characters
          </span>
          {searchQuery && (
            <span className="text-sm text-yellow-400">
              {matchCount} matches
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <KineticButton
            variant={showLineNumbers ? "secondary" : "ghost"}
            size="sm"
            icon="format_list_numbered"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
          >
            Lines
          </KineticButton>
          <KineticButton
            variant={wordWrap ? "secondary" : "ghost"}
            size="sm"
            icon="wrap_text"
            onClick={() => setWordWrap(!wordWrap)}
          >
            Wrap
          </KineticButton>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-auto"
        onMouseUp={handleTextSelection}
        style={{
          background: "linear-gradient(180deg, #0b1323 0%, #131c2b 100%)",
        }}
      >
        <div className="p-4">
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: "13px",
              lineHeight: "1.6",
            }}
          >
            <table className="w-full border-collapse">
              <tbody>
                {lines.map(({ line, highlighted }, idx) => (
                  <tr
                    key={idx}
                    className={`${
                      highlighted ? "bg-yellow-400/10" : "hover:bg-white/5"
                    } transition-colors`}
                  >
                    {showLineNumbers && (
                      <td
                        className="select-none text-right pr-4 text-slate-600 align-top"
                        style={{
                          width: "1%",
                          whiteSpace: "nowrap",
                          userSelect: "none",
                        }}
                      >
                        {idx + 1}
                      </td>
                    )}
                    <td
                      className="text-slate-300"
                      style={{
                        whiteSpace: wordWrap ? "pre-wrap" : "pre",
                        wordBreak: wordWrap ? "break-word" : "normal",
                        overflowX: wordWrap ? "visible" : "auto",
                      }}
                      dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
