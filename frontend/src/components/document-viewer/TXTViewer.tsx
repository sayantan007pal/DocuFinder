/**
 * TXTViewer — Plain text viewer with monospace font
 * Command Center design - optimized for code, logs, and plain text files
 */
"use client";

import { useState, useEffect, useCallback, useMemo, CSSProperties } from "react";
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

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && onTextSelect) {
      onTextSelect(text);
    }
  }, [onTextSelect]);

  const lines = useMemo(() => {
    const rawLines = content.split("\n");
    
    if (!searchQuery) {
      return rawLines.map((line) => ({ line, highlighted: false }));
    }

    const regex = new RegExp(`(${searchQuery})`, "gi");
    return rawLines.map((line) => ({
      line: line.replace(
        regex,
        '<mark style="background: hsl(50 100% 50% / 0.25); color: inherit; padding: 1px 4px; border-radius: 4px;">$1</mark>'
      ),
      highlighted: regex.test(line),
    }));
  }, [content, searchQuery]);

  const matchCount = useMemo(() => {
    if (!searchQuery) return 0;
    const regex = new RegExp(searchQuery, "gi");
    return (content.match(regex) || []).length;
  }, [content, searchQuery]);

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

  const statsStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 16,
  };

  const statTextStyles: CSSProperties = {
    fontSize: 13,
    color: "hsl(215, 20%, 55%)",
  };

  const matchTextStyles: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "hsl(50, 100%, 60%)",
  };

  const contentContainerStyles: CSSProperties = {
    flex: 1,
    overflow: "auto",
    background: "var(--surface-base)",
  };

  const codeBlockStyles: CSSProperties = {
    margin: 16,
    borderRadius: 12,
    background: "var(--surface-container)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  };

  const codeContentStyles: CSSProperties = {
    padding: 16,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 13,
    lineHeight: 1.65,
  };

  const lineNumberStyles: CSSProperties = {
    width: "1%",
    whiteSpace: "nowrap",
    userSelect: "none",
    textAlign: "right",
    paddingRight: 16,
    color: "hsl(215, 20%, 35%)",
    verticalAlign: "top",
    fontSize: 12,
  };

  const lineContentStyles = (highlighted: boolean): CSSProperties => ({
    whiteSpace: wordWrap ? "pre-wrap" : "pre",
    wordBreak: wordWrap ? "break-word" : "normal",
    overflowX: wordWrap ? "visible" : "auto",
    color: "hsl(210, 40%, 88%)",
  });

  if (loading) {
    return (
      <div style={loadingContainerStyles}>
        <div style={spinnerStyles} />
        <span style={{ fontSize: 13, color: "hsl(215, 20%, 55%)" }}>Loading {filename}...</span>
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div style={toolbarStyles}>
        <div style={statsStyles}>
          <span style={statTextStyles}>
            {lines.length.toLocaleString()} lines • {content.length.toLocaleString()} chars
          </span>
          {searchQuery && matchCount > 0 && (
            <span style={matchTextStyles}>
              {matchCount} {matchCount === 1 ? "match" : "matches"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <KineticButton
            variant={showLineNumbers ? "secondary" : "ghost"}
            size="sm"
            icon="format_list_numbered"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
          />
          <KineticButton
            variant={wordWrap ? "secondary" : "ghost"}
            size="sm"
            icon="wrap_text"
            onClick={() => setWordWrap(!wordWrap)}
          />
        </div>
      </div>

      {/* Content */}
      <div style={contentContainerStyles} onMouseUp={handleTextSelection}>
        <div style={codeBlockStyles}>
          <div style={codeContentStyles}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {lines.map(({ line, highlighted }, idx) => (
                  <tr
                    key={idx}
                    style={{
                      background: highlighted ? "hsl(50 100% 50% / 0.08)" : "transparent",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!highlighted) e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                    }}
                    onMouseLeave={(e) => {
                      if (!highlighted) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {showLineNumbers && (
                      <td style={lineNumberStyles}>
                        {idx + 1}
                      </td>
                    )}
                    <td
                      style={lineContentStyles(highlighted)}
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
