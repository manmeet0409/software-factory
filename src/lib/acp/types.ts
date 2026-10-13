export type ACPUpdateType =
  | 'message_chunk'
  | 'thought_chunk'
  | 'tool_call'
  | 'tool_update';

export interface ACPUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  thoughtTokens?: number;
  cachedReadTokens?: number;
}

export interface ACPResponse {
  stopReason: string;
  content: string;
  usage?: ACPUsage;
  raw?: unknown;
}

export interface ACPUpdate {
  type: ACPUpdateType | string;
  content: unknown;
  sessionId?: string;
  raw?: unknown;
}

export interface ACPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface ACPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface ACPResponseEnvelope<T = unknown> {
  jsonrpc: '2.0';
  id?: number | string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface ACPClientOptions {
  cwd: string;
  env?: Record<string, string>;
  command?: string;
  args?: string[];
}
