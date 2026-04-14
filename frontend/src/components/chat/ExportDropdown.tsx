/**
 * ExportDropdown — Export conversation in multiple formats
 * Kinetic Observatory glassmorphic dropdown aligned with Command Center
 */
"use client";

import { useState, useRef, useEffect, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import type { ChatMessage } from "@/types/api";

interface ExportDropdownProps {
  messages: ChatMessage[];
  sessionTitle?: string;
}

export function ExportDropdown({ messages, sessionTitle = "Chat" }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toMarkdown = (): string => {
    const lines = [`# ${sessionTitle}`, `*Exported on ${new Date().toLocaleString()}*`, ""];
    messages.forEach((msg) => {
      lines.push(`${msg.role === "user" ? "**You**" : "**Assistant**"}:`);
      lines.push("", msg.content, "");
      if (msg.citations?.length) {
        lines.push("*Sources:*");
        msg.citations.forEach((c, i) => lines.push(`${i + 1}. ${c.filename}${c.page_number ? ` (p.${c.page_number})` : ""}`));
        lines.push("");
      }
      lines.push("---", "");
    });
    return lines.join("\n");
  };

  const toJSON = (): string => JSON.stringify({
    title: sessionTitle,
    exported_at: new Date().toISOString(),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.created_at,
      citations: m.citations?.map((c) => ({ filename: c.filename, page: c.page_number, excerpt: c.chunk_text })),
    })),
  }, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toMarkdown());
    setCopied(true);
    setTimeout(() => { setCopied(false); setIsOpen(false); }, 1500);
  };

  const handleDownload = (format: "md" | "json") => {
    const content = format === "md" ? toMarkdown() : toJSON();
    const blob = new Blob([content], { type: format === "md" ? "text/markdown" : "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionTitle.replace(/[^a-z0-9]/gi, "_")}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  if (messages.length === 0) return null;

  const triggerStyles: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
    background: isOpen ? "rgba(255, 255, 255, 0.08)" : "transparent",
    color: "hsl(215, 20%, 65%)",
  };

  const dropdownStyles: CSSProperties = {
    position: "absolute",
    right: 0,
    top: "100%",
    marginTop: 8,
    width: 200,
    padding: 8,
    borderRadius: 12,
    zIndex: 50,
    background: "var(--surface-container-high)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)",
  };

  const menuItemStyles: CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
    background: "transparent",
    color: "hsl(215, 20%, 75%)",
  };

  const dividerStyles: CSSProperties = {
    margin: "6px 0",
    height: 1,
    background: "rgba(255, 255, 255, 0.06)",
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={triggerStyles}
        onMouseEnter={(e) => { 
          if (!isOpen) {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
            e.currentTarget.style.color = "hsl(210, 40%, 98%)";
          }
        }}
        onMouseLeave={(e) => { 
          if (!isOpen) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "hsl(215, 20%, 65%)";
          }
        }}
      >
        <Icon name="download" size={16} />
        Export
      </button>

      {isOpen && (
        <div style={dropdownStyles}>
          <button
            onClick={handleCopy}
            style={{ 
              ...menuItemStyles, 
              color: copied ? "hsl(142, 76%, 50%)" : "hsl(215, 20%, 75%)",
              background: copied ? "hsl(142 76% 50% / 0.08)" : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                e.currentTarget.style.color = "hsl(210, 40%, 98%)";
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "hsl(215, 20%, 75%)";
              }
            }}
          >
            <Icon name={copied ? "check" : "content_copy"} size={16} />
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>

          <div style={dividerStyles} />

          <button
            onClick={() => handleDownload("md")}
            style={menuItemStyles}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
              e.currentTarget.style.color = "hsl(210, 40%, 98%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "hsl(215, 20%, 75%)";
            }}
          >
            <Icon name="description" size={16} />
            Download .md
          </button>

          <button
            onClick={() => handleDownload("json")}
            style={menuItemStyles}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
              e.currentTarget.style.color = "hsl(210, 40%, 98%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "hsl(215, 20%, 75%)";
            }}
          >
            <Icon name="data_object" size={16} />
            Download .json
          </button>
        </div>
      )}
    </div>
  );
}
