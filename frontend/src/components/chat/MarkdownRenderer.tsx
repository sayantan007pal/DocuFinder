/**
 * MarkdownRenderer — Renders markdown with syntax highlighting
 * Kinetic Observatory styling for code blocks, tables, and lists
 */
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useState } from "react";
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
                className="px-1.5 py-0.5 rounded text-sm font-mono"
                style={{ background: "rgba(255, 255, 255, 0.08)", color: "hsl(262, 80%, 75%)" }}
                {...rest}
              >
                {children}
              </code>
            );
          },

          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed" style={{ color: "hsl(210, 40%, 92%)" }}>{children}</p>;
          },

          h1({ children }) {
            return <h1 className="text-xl font-semibold mb-3 mt-4 first:mt-0" style={{ color: "hsl(210, 40%, 98%)" }}>{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mb-2 mt-4 first:mt-0" style={{ color: "hsl(210, 40%, 98%)" }}>{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0" style={{ color: "hsl(210, 40%, 98%)" }}>{children}</h3>;
          },

          ul({ children }) {
            return <ul className="mb-3 ml-4 space-y-1" style={{ listStyleType: "none" }}>{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-3 ml-4 space-y-1 list-decimal" style={{ color: "hsl(215, 20%, 65%)" }}>{children}</ol>;
          },
          li({ children }) {
            return (
              <li className="relative pl-4 before:content-['•'] before:absolute before:left-0 before:text-purple-400">
                <span style={{ color: "hsl(210, 40%, 92%)" }}>{children}</span>
              </li>
            );
          },

          blockquote({ children }) {
            return (
              <blockquote className="pl-4 my-3 italic" style={{ borderLeft: "3px solid hsl(262, 80%, 65%)", color: "hsl(215, 20%, 75%)" }}>
                {children}
              </blockquote>
            );
          },

          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg" style={{ background: "rgba(255, 255, 255, 0.02)" }}>
                <table className="w-full text-sm">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead style={{ background: "rgba(255, 255, 255, 0.05)" }}>{children}</thead>;
          },
          th({ children }) {
            return <th className="px-4 py-2 text-left font-medium" style={{ color: "hsl(210, 40%, 98%)" }}>{children}</th>;
          },
          td({ children }) {
            return <td className="px-4 py-2" style={{ color: "hsl(215, 20%, 75%)", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>{children}</td>;
          },

          a({ children, href }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors"
                style={{ color: "hsl(200, 90%, 65%)" }}
              >
                {children}
              </a>
            );
          },

          hr() {
            return <hr className="my-4" style={{ border: "none", height: 1, background: "rgba(255, 255, 255, 0.1)" }} />;
          },

          strong({ children }) {
            return <strong className="font-semibold" style={{ color: "hsl(210, 40%, 98%)" }}>{children}</strong>;
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

  return (
    <div className="relative my-3 rounded-xl overflow-hidden" style={{ background: "rgba(11, 19, 35, 0.8)" }}>
      <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ background: "rgba(255, 255, 255, 0.03)" }}>
        <span style={{ color: "hsl(215, 20%, 55%)" }}>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded transition-colors"
          style={{
            background: copied ? "rgba(74, 222, 128, 0.1)" : "transparent",
            color: copied ? "hsl(142, 76%, 50%)" : "hsl(215, 20%, 55%)",
          }}
        >
          <Icon name={copied ? "check" : "content_copy"} size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm">
        <code className={`language-${language}`}>{children}</code>
      </pre>
    </div>
  );
}
