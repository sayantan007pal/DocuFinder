/**
 * ChatSessionItem — Individual chat session card with rename/delete
 * Kinetic Observatory design with gradient highlights
 */
"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { KineticButton } from "@/components/ui/kinetic-button";
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

  return (
    <div
      className={`group relative rounded-lg p-3 cursor-pointer transition-all ${
        isActive
          ? "bg-gradient-to-r from-purple-500/20 to-cyan-500/10"
          : "hover:bg-white/5"
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      style={
        isActive
          ? {
              boxShadow: "inset 0 0 0 1px rgba(216, 185, 255, 0.2)",
            }
          : {}
      }
    >
      <div className="flex items-start gap-3">
        {/* Chat Icon */}
        <div
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            isActive ? "bg-primary/20" : "bg-white/5"
          }`}
        >
          <Icon
            name={session.doc_filter ? "description" : "chat"}
            size={16}
            className={isActive ? "text-primary" : "text-slate-400"}
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
              className="w-full bg-white/10 rounded px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-primary/50"
              disabled={isUpdating}
            />
          ) : (
            <h4
              className={`text-sm font-medium truncate ${
                isActive ? "text-white" : "text-slate-200"
              }`}
            >
              {session.title}
            </h4>
          )}
          
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">
              {session.message_count} messages
            </span>
            <span className="text-xs text-slate-600">•</span>
            <span className="text-xs text-slate-500">
              {formatTime(session.updated_at)}
            </span>
          </div>

          {session.doc_filter && (
            <div className="mt-1.5 flex items-center gap-1">
              <Icon name="filter_alt" size={12} className="text-cyan-400" />
              <span className="text-xs text-cyan-400">Document filter active</span>
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
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title="Rename"
              disabled={isUpdating}
            >
              <Icon name="edit" size={14} className="text-slate-400" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
              title="Delete"
              disabled={isDeleting}
            >
              <Icon
                name={isDeleting ? "hourglass_empty" : "delete"}
                size={14}
                className="text-red-400"
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
