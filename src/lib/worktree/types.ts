export interface WorktreeInfo {
  ticketId?: string;
  path: string;
  branch?: string;
  commit?: string;
  head?: string;
  isMain?: boolean;
  locked?: boolean;
  prunable?: boolean;
}
