/**
 * MarkdownRenderer — Renders markdown with syntax highlighting
 * Kinetic Observatory design aligned with Command Center dashboard
 */
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useState, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code(props) {
            const { children, className, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            const isInline = !match;

            if (!isInline && language) {
              return <CodeBlock language={language}>{String(children).replace(/\n$/, "")}</CodeBlock>;
            }

            return (
              <code
                style={{ 
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  background: "rgba(255, 255, 255, 0.08)", 
                  color: "hsl(262, 80%, 75%)",
                }}
                {...rest}
              >
                {children}
              </code>
            );
          },

          p({ children }) {
            return (
              <p 
                style={{ 
                  marginBottom: 12, 
                  lineHeight: 1.7, 
                  color: "hsl(210, 40%, 92%)",
                  fontSize: 14,
                }}
              >
                {children}
              </p>
            );
          },

          h1({ children }) {
            return (
              <h1 
                style={{ 
                  fontSize: 22, 
                  fontWeight: 600, 
                  marginBottom: 12, 
                  marginTop: 20,
                  color: "hsl(210, 40%, 98%)",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  letterSpacing: "-0.02em",
                }}
              >
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 
                style={{ 
                  fontSize: 18, 
                  fontWeight: 600, 
                  marginBottom: 10, 
                  marginTop: 16,
                  color: "hsl(210, 40%, 98%)",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                }}
              >
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 
                style={{ 
                  fontSize: 16, 
                  fontWeight: 600, 
                  marginBottom: 8, 
                  marginTop: 14,
                  color: "hsl(210, 40%, 98%)",
                }}
              >
                {children}
              </h3>
            );
          },

          ul({ children }) {
            return (
              <ul 
                style={{ 
                  marginBottom: 12, 
                  marginLeft: 8,
                  listStyleType: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol 
                style={{ 
                  marginBottom: 12, 
                  marginLeft: 20, 
                  color: "hsl(215, 20%, 65%)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {children}
              </ol>
            );
          },
          li({ children }) {
            return (
              <li 
                style={{ 
                  position: "relative",
                  paddingLeft: 16,
                  color: "hsl(210, 40%, 92%)",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    color: "hsl(262, 80%, 70%)",
                  }}
                >
                  •
                </span>
                {children}
              </li>
            );
          },

          blockquote({ children }) {
            return (
              <blockquote 
                style={{ 
                  paddingLeft: 16, 
                  marginTop: 12,
                  marginBottom: 12, 
                  fontStyle: "italic",
                  borderLeft: "3px solid",
                  borderImage: "linear-gradient(180deg, hsl(262, 80%, 70%), hsl(200, 90%, 65%)) 1",
                  color: "hsl(215, 20%, 75%)",
                }}
              >
                {children}
              </blockquote>
            );
          },

          table({ children }) {
            return (
              <div 
                style={{ 
                  overflowX: "auto", 
                  marginTop: 12,
                  marginBottom: 12, 
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.02)",
                }}
              >
                <table style={{ width: "100%", fontSize: 14 }}>{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead style={{ background: "rgba(255, 255, 255, 0.04)" }}>{children}</thead>;
          },
          th({ children }) {
            return (
              <th 
                style={{ 
                  padding: "12px 16px", 
                  textAlign: "left", 
                  fontWeight: 600,
                  color: "hsl(210, 40%, 98%)",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td 
                style={{ 
                  padding: "12px 16px", 
                  color: "hsl(215, 20%, 75%)", 
                  borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                {children}
              </td>
            );
          },

          a({ children, href }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ 
                  color: "hsl(200, 90%, 65%)",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = "hsl(200, 90%, 75%)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "hsl(200, 90%, 65%)"}
              >
                {children}
              </a>
            );
          },

          hr() {
            return (
              <hr 
                style={{ 
                  marginTop: 16, 
                  marginBottom: 16, 
                  border: "none", 
                  height: 1, 
                  background: "rgba(255, 255, 255, 0.08)",
                }} 
              />
            );
          },

          strong({ children }) {
            return <strong style={{ fontWeight: 600, color: "hsl(210, 40%, 98%)" }}>{children}</strong>;
          },

          em({ children }) {
            return <em style={{ color: "hsl(215, 20%, 85%)" }}>{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children, language }: { children: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const containerStyles: CSSProperties = {
    position: "relative",
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    background: "var(--surface-container-low)",
  };

  const headerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    background: "rgba(255, 255, 255, 0.03)",
  };

  const languageLabelStyles: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "hsl(215, 20%, 55%)",
  };

  const copyButtonStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
    background: copied ? "hsl(142 76% 50% / 0.1)" : "transparent",
    color: copied ? "hsl(142, 76%, 50%)" : "hsl(215, 20%, 55%)",
    fontSize: 12,
  };

  const preStyles: CSSProperties = {
    padding: 16,
    overflowX: "auto",
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  };

  return (
    <div style={containerStyles}>
      <div style={headerStyles}>
        <span style={languageLabelStyles}>{language}</span>
        <button
          onClick={handleCopy}
          style={copyButtonStyles}
          onMouseEnter={(e) => {
            if (!copied) e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
          }}
          onMouseLeave={(e) => {
            if (!copied) e.currentTarget.style.background = "transparent";
          }}
        >
          <Icon name={copied ? "check" : "content_copy"} size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre style={preStyles}>
        <code className={`language-${language}`}>{children}</code>
      </pre>
    </div>
  );
}
