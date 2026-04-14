/**
 * src/types/api.ts — TypeScript API response types.
 */

export interface Document {
  id: string;
  filename: string;
  file_size: number;
  status: "queued" | "processing" | "completed" | "failed";
  page_count: number;
  pdf_type?: string;
  parser_used?: string;
  ingested_at?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface UploadResponse {
  doc_id: string;
  filename: string;
  file_size: number;
  status: string;
  task_id?: string;
  message: string;
}

export interface SearchHit {
  doc_id: string;
  filename: string;
  page_number?: number;
  chunk_text: string;
  score: number;
}

export interface SearchResponse {
  answer: string;
  results: SearchHit[];
  total: number;
  took_ms: number;
  cached: boolean;
  provider_used: string;
}

export interface ExtractedTable {
  id: string;
  doc_id: string;
  page_number: number;
  table_index: number;
  headers: string[];
  rows: string[][];
  row_count: number;
  column_count: number;
  confidence: "high" | "medium" | "low";
  source_parser: string;
}

export interface SummaryResponse {
  doc_id: string;
  filename: string;
  summary: string;
  provider_used: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded";
  services: {
    qdrant: boolean;
    mongodb: boolean;
    valkey: boolean;
    ollama: boolean;
    unstructured: boolean;
  };
  version: string;
  environment: string;
}

// Chat Types
export interface ChatSession {
  id: string;
  title: string;
  doc_filter?: string;
  message_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: SearchHit[];
  metadata: {
    took_ms?: number;
    cached?: boolean;
    provider?: string;
    tokens?: number;
  };
  created_at: string;
}

export interface ChatSessionListResponse {
  sessions: ChatSession[];
  total: number;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  total: number;
}
