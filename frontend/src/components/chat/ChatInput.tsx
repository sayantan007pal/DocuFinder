/**
 * ChatInput — Message input with voice button placeholder and keyboard hints
 * Kinetic Observatory design with gradient focus states
 */
"use client";

import { useState, useRef, useCallback, KeyboardEvent, useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  selectedText?: string | null;
  onClearSelection?: () => void;
  suggestions?: string[];
}

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder = "Ask a question...",
  selectedText,
  onClearSelection,
  suggestions: customSuggestions,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  }, [message]);

  const handleSubmit = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || isLoading || disabled) return;

    const fullMessage = selectedText
      ? `Regarding this text: "${selectedText}"\n\n${trimmed}`
      : trimmed;

    onSend(fullMessage);
    setMessage("");
    onClearSelection?.();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [message, selectedText, isLoading, disabled, onSend, onClearSelection]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    // Plain Enter also sends (Shift+Enter for newline)
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Voice button handler (placeholder)
  const handleVoiceClick = () => {
    // TODO: Implement voice input with Web Speech API
    console.log("Voice input clicked - functionality coming soon");
  };

  // Default suggestions based on context
  const suggestions = customSuggestions || (selectedText
    ? ["Explain this in detail", "Summarize this section", "What does this mean?"]
    : ["Summarize this document", "What are the key points?", "Find mentions of..."]);

  return (
    <div className="p-4" style={{ background: "rgba(19, 28, 43, 0.9)" }}>
      {/* Selected Text Context */}
      {selectedText && (
        <div
          className="mb-3 p-3 rounded-xl"
          style={{ background: "hsl(200 90% 65% / 0.1)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs" style={{ color: "hsl(200, 90%, 65%)" }}>
              <Icon name="format_quote" size={14} />
              <span>Ask about selected text:</span>
            </div>
            <button
              onClick={onClearSelection}
              className="p-1 rounded-lg transition-colors"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <Icon name="close" size={14} style={{ color: "hsl(215, 20%, 55%)" }} />
            </button>
          </div>
          <p className="text-sm line-clamp-2" style={{ color: "hsl(215, 20%, 75%)" }}>
            {selectedText}
          </p>
        </div>
      )}

      {/* Quick Suggestions */}
      {message.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setMessage(suggestion)}
              className="px-3 py-1.5 text-xs rounded-full transition-all duration-200"
              style={{ background: "rgba(255, 255, 255, 0.04)", color: "hsl(215, 20%, 65%)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.color = "hsl(215, 20%, 85%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                e.currentTarget.style.color = "hsl(215, 20%, 65%)";
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div
        className="flex items-end gap-3 p-3 rounded-xl transition-all duration-200"
        style={{
          background: focused ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.03)",
          boxShadow: focused
            ? "inset 0 0 0 1px hsl(262 80% 65% / 0.3), 0 0 20px hsl(262 80% 65% / 0.05)"
            : "inset 0 0 0 1px rgba(255, 255, 255, 0.05)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          className="flex-1 bg-transparent outline-none text-sm resize-none min-h-[24px] max-h-[150px]"
          style={{ color: "hsl(210, 40%, 98%)", lineHeight: "1.6" }}
        />

        {/* Voice Button (Placeholder) */}
        <button
          onClick={handleVoiceClick}
          disabled={isLoading}
          className="p-2 rounded-lg transition-all duration-200 shrink-0"
          style={{ background: "transparent", color: "hsl(215, 20%, 55%)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            e.currentTarget.style.color = "hsl(262, 80%, 70%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "hsl(215, 20%, 55%)";
          }}
          title="Voice input (coming soon)"
        >
          <Icon name="mic" size={20} />
        </button>

        {/* Send Button */}
        <KineticButton
          variant="primary"
          size="sm"
          icon={isLoading ? "hourglass_empty" : "send"}
          onClick={handleSubmit}
          disabled={!message.trim() || isLoading || disabled}
          loading={isLoading}
        >
          Send
        </KineticButton>
      </div>

      {/* Keyboard Hint */}
      <div
        className="flex items-center justify-end gap-4 mt-2 text-xs"
        style={{ color: "hsl(215, 20%, 45%)" }}
      >
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
            Enter
          </kbd>
          <span>to send</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
            Shift
          </kbd>
          <span>+</span>
          <kbd className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
            Enter
          </kbd>
          <span>for newline</span>
        </span>
      </div>
    </div>
  );
}
