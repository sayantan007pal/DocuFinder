/**
 * ChatSessionItem — Individual chat session card with rename/delete
 * Kinetic Observatory design aligned with Command Center nav patterns
 */
"use client";

import { useState, useRef, useEffect, KeyboardEvent, CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import type { ChatSession } from "@/types/api";

interface ChatSessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  isUpdating?: boolean;
  isDeleting?: boolean;
}

export function ChatSessionItem({
  session,
  isActive,
  onClick,
  onRename,
  onDelete,
  isUpdating,
  isDeleting,
}: ChatSessionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title);
  const [showActions, setShowActions] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (editValue.trim() && editValue !== session.title) {
        onRename(editValue.trim());
      }
      setIsEditing(false);
    }
    if (e.key === "Escape") {
      setEditValue(session.title);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    if (editValue.trim() && editValue !== session.title) {
      onRename(editValue.trim());
    } else {
      setEditValue(session.title);
    }
    setIsEditing(false);
  };

  // Format relative time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Container styles - dashboard nav item pattern
  const containerStyles: CSSProperties = {
    position: "relative",
    padding: "12px 16px",
    borderRadius: 10,
    cursor: "pointer",
    transition: "all 0.15s ease",
    background: isActive
      ? "linear-gradient(135deg, hsl(262 80% 65% / 0.2), hsl(200 90% 65% / 0.1))"
      : isHovered
      ? "var(--surface-container)"
      : "transparent",
    ...(isActive && {
      boxShadow: "inset 0 0 0 1px hsl(262 80% 65% / 0.2)",
    }),
  };

  // Active indicator (left border gradient)
  const activeIndicatorStyles: CSSProperties = {
    position: "absolute",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    width: 3,
    height: 24,
    borderRadius: "0 3px 3px 0",
    background: "linear-gradient(180deg, hsl(262, 80%, 70%) 0%, hsl(200, 90%, 65%) 100%)",
    opacity: isActive ? 1 : 0,
    transition: "opacity 0.15s ease",
  };

  // Icon container styles
  const iconContainerStyles: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: isActive 
      ? "linear-gradient(135deg, hsl(262 80% 65% / 0.2), hsl(200 90% 65% / 0.15))"
      : "rgba(255, 255, 255, 0.04)",
    transition: "background 0.15s ease",
  };

  // Action button styles
  const actionButtonStyles: CSSProperties = {
    padding: 6,
    borderRadius: 6,
    background: "transparent",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      style={containerStyles}
      onClick={onClick}
      onMouseEnter={() => {
        setShowActions(true);
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setShowActions(false);
        setIsHovered(false);
      }}
    >
      {/* Active indicator */}
      <div style={activeIndicatorStyles} />

      <div className="flex items-start gap-3">
        {/* Chat Icon */}
        <div style={iconContainerStyles}>
          <Icon
            name={session.doc_filter ? "description" : "chat"}
            size={18}
            style={{ 
              color: isActive ? "hsl(262, 80%, 70%)" : "hsl(215, 20%, 65%)" 
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: 6,
                background: "var(--surface-container-high)",
                border: "none",
                outline: "none",
                color: "hsl(210, 40%, 98%)",
                fontSize: 13,
                fontFamily: "inherit",
              }}
              disabled={isUpdating}
            />
          ) : (
            <h4
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? "hsl(210, 40%, 98%)" : "hsl(215, 20%, 85%)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                transition: "color 0.15s ease",
              }}
            >
              {session.title}
            </h4>
          )}
          
          <div 
            className="flex items-center gap-2" 
            style={{ marginTop: 4 }}
          >
            <span style={{ fontSize: 11, color: "hsl(215, 20%, 55%)" }}>
              {session.message_count} messages
            </span>
            <span style={{ fontSize: 11, color: "hsl(215, 20%, 45%)" }}>•</span>
            <span style={{ fontSize: 11, color: "hsl(215, 20%, 55%)" }}>
              {formatTime(session.updated_at)}
            </span>
          </div>

          {session.doc_filter && (
            <div 
              className="flex items-center gap-1.5" 
              style={{ marginTop: 6 }}
            >
              <Icon name="filter_alt" size={12} style={{ color: "hsl(200, 90%, 65%)" }} />
              <span style={{ fontSize: 11, color: "hsl(200, 90%, 65%)" }}>
                Document filter active
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {(showActions || isActive) && !isEditing && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsEditing(true)}
              style={actionButtonStyles}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              title="Rename"
              disabled={isUpdating}
            >
              <Icon name="edit" size={14} style={{ color: "hsl(215, 20%, 65%)" }} />
            </button>
            <button
              onClick={onDelete}
              style={{
                ...actionButtonStyles,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "hsl(0 84% 60% / 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              title="Delete"
              disabled={isDeleting}
            >
              <Icon
                name={isDeleting ? "hourglass_empty" : "delete"}
                size={14}
                style={{ color: "hsl(0, 84%, 60%)" }}
                className={isDeleting ? "animate-spin" : ""}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
