/**
 * DOCXViewer — Renders DOCX files as styled HTML using mammoth
 * Command Center design system aligned with GlassmorphicCard
 */
"use client";

import { useState, useEffect, useCallback, CSSProperties } from "react";
import mammoth from "mammoth";
import { Icon } from "@/components/ui/icon";
import { fetchDocumentArrayBuffer } from "@/lib/api-client";

interface DOCXViewerProps {
  docId: string;
  filename: string;
  searchQuery?: string;
  onTextSelect?: (text: string) => void;
}

export function DOCXViewer({
  docId,
  filename,
  searchQuery,
  onTextSelect,
}: DOCXViewerProps) {
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch and parse DOCX
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDocumentArrayBuffer(docId)
      .then(async (arrayBuffer) => {
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
              "b => strong",
              "i => em",
              "u => u",
            ],
          }
        );
        const textResult = await mammoth.extractRawText({ arrayBuffer });

        if (!cancelled) {
          setHtmlContent(result.value);
          setRawText(textResult.value);
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

  const highlightedHtml = searchQuery
    ? htmlContent.replace(
        new RegExp(`(${searchQuery})`, "gi"),
        '<mark style="background: hsl(50 100% 50% / 0.25); color: inherit; padding: 1px 4px; border-radius: 4px;">$1</mark>'
      )
    : htmlContent;

  // Styles
  const containerStyles: CSSProperties = {
    height: "100%",
    overflow: "auto",
    padding: 24,
    background: "var(--surface-base)",
  };

  const cardStyles: CSSProperties = {
    maxWidth: 900,
    margin: "0 auto",
    padding: 32,
    borderRadius: 16,
    background: "var(--surface-container)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
  };

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
    <div style={containerStyles} onMouseUp={handleTextSelection}>
      <div style={cardStyles}>
        {/* Document styles */}
        <style jsx global>{`
          .docx-content {
            font-family: "Inter", sans-serif;
            color: hsl(210, 40%, 92%);
            line-height: 1.75;
            font-size: 15px;
          }
          .docx-content h1 {
            font-family: var(--font-space-grotesk), "Space Grotesk", sans-serif;
            font-size: 1.875rem;
            font-weight: 600;
            margin: 2rem 0 1rem;
            color: hsl(210, 40%, 98%);
            letter-spacing: -0.02em;
          }
          .docx-content h1:first-child {
            margin-top: 0;
          }
          .docx-content h2 {
            font-family: var(--font-space-grotesk), "Space Grotesk", sans-serif;
            font-size: 1.375rem;
            font-weight: 600;
            margin: 1.5rem 0 0.75rem;
            color: hsl(210, 40%, 96%);
            letter-spacing: -0.01em;
          }
          .docx-content h3 {
            font-family: var(--font-space-grotesk), "Space Grotesk", sans-serif;
            font-size: 1.125rem;
            font-weight: 500;
            margin: 1.25rem 0 0.5rem;
            color: hsl(210, 40%, 94%);
          }
          .docx-content p {
            margin: 0.875rem 0;
          }
          .docx-content ul,
          .docx-content ol {
            margin: 0.875rem 0;
            padding-left: 1.75rem;
          }
          .docx-content li {
            margin: 0.375rem 0;
          }
          .docx-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 1.25rem 0;
            border-radius: 10px;
            overflow: hidden;
          }
          .docx-content th,
          .docx-content td {
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          }
          .docx-content th {
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: hsl(215, 20%, 65%);
            background: rgba(255, 255, 255, 0.04);
          }
          .docx-content strong {
            font-weight: 600;
            color: hsl(210, 40%, 98%);
          }
          .docx-content em {
            font-style: italic;
            color: hsl(215, 20%, 80%);
          }
          .docx-content a {
            color: hsl(200, 90%, 65%);
            text-decoration: underline;
            text-underline-offset: 2px;
            transition: color 0.15s ease;
          }
          .docx-content a:hover {
            color: hsl(200, 90%, 75%);
          }
          .docx-content img {
            max-width: 100%;
            border-radius: 10px;
            margin: 1.25rem 0;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          }
          .docx-content blockquote {
            margin: 1rem 0;
            padding-left: 16px;
            border-left: 3px solid hsl(262, 80%, 65%);
            color: hsl(215, 20%, 75%);
            font-style: italic;
          }
          .docx-content code {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 13px;
            padding: 2px 6px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.06);
            color: hsl(262, 80%, 75%);
          }
          .docx-content pre {
            margin: 1rem 0;
            padding: 16px;
            border-radius: 10px;
            background: var(--surface-container-low);
            overflow-x: auto;
          }
          .docx-content pre code {
            padding: 0;
            background: transparent;
          }
        `}</style>

        <div
          className="docx-content"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </div>
    </div>
  );
}
