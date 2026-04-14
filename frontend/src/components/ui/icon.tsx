/**
 * Material Symbols Icon Component
 * Uses Google Material Symbols Rounded font
 */

import { CSSProperties } from "react";

interface IconProps {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ 
  name, 
  size = 24, 
  filled = false, 
  className = "",
  style 
}: IconProps) {
  return (
    <span
      className={`material-symbols-rounded ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        lineHeight: 1,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

// Common icon mappings for the Command Center
export const Icons = {
  // Navigation
  dashboard: "dashboard",
  documents: "description",
  search: "search",
  chat: "forum",
  graph: "hub",
  settings: "settings",
  
  // Actions
  upload: "upload_file",
  download: "download",
  delete: "delete",
  edit: "edit",
  add: "add",
  close: "close",
  menu: "menu",
  expand: "expand_more",
  collapse: "expand_less",
  
  // Status
  success: "check_circle",
  error: "error",
  warning: "warning",
  info: "info",
  pending: "schedule",
  processing: "sync",
  
  // Document types
  pdf: "picture_as_pdf",
  doc: "article",
  table: "table_chart",
  
  // AI/Intelligence
  ai: "auto_awesome",
  synthesis: "auto_awesome",
  insight: "lightbulb",
  analyze: "analytics",
  
  // Graph
  node: "radio_button_checked",
  connection: "link",
  conflict: "warning",
  
  // Misc
  user: "person",
  logout: "logout",
  notification: "notifications",
  filter: "filter_list",
  sort: "sort",
  microphone: "mic",
  attach: "attach_file",
  send: "send",
} as const;
