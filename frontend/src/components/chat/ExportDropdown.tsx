/**
 * ExportDropdown — Export conversation in multiple formats
 * Kinetic Observatory glassmorphic dropdown
 */
"use client";

import { useState, useRef, useEffect } from "react";
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

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
        style={{ background: isOpen ? "rgba(255, 255, 255, 0.08)" : "transparent", color: "hsl(215, 20%, 65%)" }}
        onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; }}
        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
      >
        <Icon name="download" size={16} />
        Export
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-48 py-2 rounded-xl z-50"
          style={{
            background: "rgba(19, 28, 43, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          }}
        >
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors"
            style={{ color: copied ? "hsl(142, 76%, 50%)" : "hsl(215, 20%, 75%)" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <Icon name={copied ? "check" : "content_copy"} size={16} />
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <div className="my-2 h-px" style={{ background: "rgba(255, 255, 255, 0.05)" }} />
          <button
            onClick={() => handleDownload("md")}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors"
            style={{ color: "hsl(215, 20%, 75%)" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <Icon name="description" size={16} />
            Download .md
          </button>
          <button
            onClick={() => handleDownload("json")}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors"
            style={{ color: "hsl(215, 20%, 75%)" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <Icon name="data_object" size={16} />
            Download .json
          </button>
        </div>
      )}
    </div>
  );
}
