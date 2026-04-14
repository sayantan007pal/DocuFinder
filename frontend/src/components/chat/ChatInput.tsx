/**
 * ChatInput — Message input with voice button placeholder and keyboard hints
 * Kinetic Observatory design aligned with Command Center dashboard
 */
"use client";

import { useState, useRef, useCallback, KeyboardEvent, useEffect, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";
import { GlassmorphicCard } from "@/components/ui/glassmorphic-card";

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

  // Styles
  const containerStyles: CSSProperties = {
    padding: 20,
    background: "var(--surface-container-low)",
    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
  };

  const selectedTextCardStyles: CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    background: "hsl(200 90% 65% / 0.08)",
    marginBottom: 16,
  };

  const suggestionChipStyles: CSSProperties = {
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.04)",
    color: "hsl(215, 20%, 65%)",
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };

  const inputContainerStyles: CSSProperties = {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    background: focused ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.03)",
    position: "relative",
    transition: "all 0.2s ease",
  };

  const bottomAccentStyles: CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: "0 0 12px 12px",
    background: focused
      ? "linear-gradient(90deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)"
      : "transparent",
    transition: "background 0.2s ease",
  };

  const textareaStyles: CSSProperties = {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "hsl(210, 40%, 98%)",
    fontSize: 14,
    lineHeight: 1.6,
    resize: "none",
    minHeight: 24,
    maxHeight: 150,
    fontFamily: "inherit",
  };

  const voiceButtonStyles: CSSProperties = {
    padding: 10,
    borderRadius: 8,
    background: "transparent",
    color: "hsl(215, 20%, 55%)",
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const kbdStyles: CSSProperties = {
    padding: "4px 8px",
    borderRadius: 6,
    background: "rgba(255, 255, 255, 0.06)",
    fontSize: 11,
    fontFamily: "inherit",
    fontWeight: 500,
    color: "hsl(215, 20%, 55%)",
  };

  return (
    <div style={containerStyles}>
      {/* Selected Text Context */}
      {selectedText && (
        <div style={selectedTextCardStyles}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div className="flex items-center gap-2">
              <Icon name="format_quote" size={14} style={{ color: "hsl(200, 90%, 65%)" }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "hsl(200, 90%, 65%)" }}>
                Ask about selected text
              </span>
            </div>
            <button
              onClick={onClearSelection}
              style={{
                padding: 4,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <Icon name="close" size={14} style={{ color: "hsl(215, 20%, 55%)" }} />
            </button>
          </div>
          <p 
            className="line-clamp-2" 
            style={{ 
              fontSize: 13, 
              color: "hsl(215, 20%, 75%)",
              lineHeight: 1.5,
            }}
          >
            {selectedText}
          </p>
        </div>
      )}

      {/* Quick Suggestions */}
      {message.length === 0 && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 16 }}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setMessage(suggestion)}
              style={suggestionChipStyles}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.color = "hsl(210, 40%, 90%)";
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
      <div style={inputContainerStyles}>
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
          style={textareaStyles}
        />

        {/* Voice Button (Placeholder) */}
        <button
          onClick={handleVoiceClick}
          disabled={isLoading}
          style={voiceButtonStyles}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
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
          size="md"
          icon={isLoading ? "hourglass_empty" : "send"}
          onClick={handleSubmit}
          disabled={!message.trim() || isLoading || disabled}
          loading={isLoading}
        >
          Send
        </KineticButton>

        {/* Bottom accent bar */}
        <div style={bottomAccentStyles} />
      </div>

      {/* Keyboard Hint */}
      <div
        className="flex items-center justify-end gap-4"
        style={{ marginTop: 12 }}
      >
        <span className="flex items-center gap-1.5">
          <kbd style={kbdStyles}>Enter</kbd>
          <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)" }}>send</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd style={kbdStyles}>Shift</kbd>
          <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)" }}>+</span>
          <kbd style={kbdStyles}>Enter</kbd>
          <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)" }}>newline</span>
        </span>
      </div>
    </div>
  );
}
