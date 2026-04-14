/**
 * DOCXViewer — Renders DOCX files as styled HTML using mammoth
 * Follows Kinetic Observatory design system
 */
"use client";

import { useState, useEffect, useCallback } from "react";
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

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && onTextSelect) {
      onTextSelect(text);
    }
  }, [onTextSelect]);

  // Highlight search matches
  const highlightedHtml = searchQuery
    ? htmlContent.replace(
        new RegExp(`(${searchQuery})`, "gi"),
        '<mark class="bg-yellow-400/40 text-inherit rounded px-0.5">$1</mark>'
      )
    : htmlContent;

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
    <div className="h-full overflow-auto p-6" onMouseUp={handleTextSelection}>
      <div
        className="max-w-4xl mx-auto p-8 rounded-xl"
        style={{
          background: "rgba(255, 255, 255, 0.04)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Document styles */}
        <style jsx global>{`
          .docx-content {
            font-family: "Inter", sans-serif;
            color: hsl(210, 40%, 98%);
            line-height: 1.7;
          }
          .docx-content h1 {
            font-family: "Space Grotesk", sans-serif;
            font-size: 2rem;
            font-weight: 600;
            margin: 1.5rem 0 1rem;
            color: hsl(210, 40%, 98%);
            letter-spacing: -0.02em;
          }
          .docx-content h2 {
            font-family: "Space Grotesk", sans-serif;
            font-size: 1.5rem;
            font-weight: 600;
            margin: 1.25rem 0 0.75rem;
            color: hsl(210, 40%, 95%);
            letter-spacing: -0.01em;
          }
          .docx-content h3 {
            font-family: "Space Grotesk", sans-serif;
            font-size: 1.25rem;
            font-weight: 500;
            margin: 1rem 0 0.5rem;
            color: hsl(210, 40%, 92%);
          }
          .docx-content p {
            margin: 0.75rem 0;
          }
          .docx-content ul,
          .docx-content ol {
            margin: 0.75rem 0;
            padding-left: 1.5rem;
          }
          .docx-content li {
            margin: 0.25rem 0;
          }
          .docx-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 1rem 0;
          }
          .docx-content th,
          .docx-content td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }
          .docx-content th {
            font-weight: 600;
            background: rgba(255, 255, 255, 0.05);
          }
          .docx-content strong {
            font-weight: 600;
            color: hsl(262, 80%, 75%);
          }
          .docx-content em {
            font-style: italic;
            color: hsl(200, 90%, 70%);
          }
          .docx-content a {
            color: hsl(200, 90%, 65%);
            text-decoration: underline;
          }
          .docx-content img {
            max-width: 100%;
            border-radius: 8px;
            margin: 1rem 0;
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
