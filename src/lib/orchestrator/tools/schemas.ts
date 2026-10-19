import { z } from 'zod';

// ==========================================
// 1. THE WALL SCHEMAS
// ==========================================

export const PinCategorySchema = z.enum(['fact', 'logic', 'lesson']).describe('Category of the pin on The Wall');

export const ReadWallInputSchema = z.object({
  module: z.string().optional().describe('Filter pins by module name (e.g. "auth", "database")'),
  tag: z.string().optional().describe('Filter pins by tag name (e.g. "concurrency", "security")'),
  category: PinCategorySchema.optional().describe('Filter pins by category'),
  searchQuery: z.string().optional().describe('Text search against title and description'),
  limit: z.number().int().min(1).max(100).default(30).describe('Max number of pins to return'),
});
export type ReadWallInput = z.infer<typeof ReadWallInputSchema>;

export const RequestPinToWallInputSchema = z.object({
  title: z.string().min(5).max(120).describe('Concise title for the proposed pin'),
  description: z.string().min(10).describe('Detailed explanation of the fact, logic, or lesson'),
  category: PinCategorySchema.describe('Category: fact, logic, or lesson'),
  module: z.string().min(1).describe('The project module this relates to'),
  tags: z.array(z.string()).min(1).describe('Existing tags to categorize this pin'),
  reasoning: z.string().min(5).describe('Justification why this is a valuable long-term asset for the Wall'),
});
export type RequestPinToWallInput = z.infer<typeof RequestPinToWallInputSchema>;

export const PinToWallInputSchema = z.object({
  title: z.string().min(5).max(120).describe('Concise title for the pin'),
  description: z.string().min(10).describe('Detailed explanation of the fact, logic, or lesson'),
  category: PinCategorySchema.describe('Category: fact, logic, or lesson'),
  module: z.string().min(1).describe('Authorized module name'),
  tags: z.array(z.string()).min(1).describe('Authorized tag names'),
});
export type PinToWallInput = z.infer<typeof PinToWallInputSchema>;

export const RequestTaxonomyInputSchema = z.object({
  type: z.enum(['module', 'tag']).describe('Whether you are proposing a new module or a new tag'),
  proposedName: z.string().min(2).max(40).describe('Proposed name for the new module or tag'),
  rationale: z.string().min(10).describe('Explanation of why existing modules/tags are insufficient'),
});
export type RequestTaxonomyInput = z.infer<typeof RequestTaxonomyInputSchema>;

export const ManageWallTaxonomyInputSchema = z.object({
  action: z.enum(['add', 'retire']).describe('Action to perform on taxonomy'),
  type: z.enum(['module', 'tag']).describe('Target taxonomy type'),
  name: z.string().min(2).max(40).describe('Name of the module or tag'),
  description: z.string().optional().describe('Description of the module or tag purpose'),
});
export type ManageWallTaxonomyInput = z.infer<typeof ManageWallTaxonomyInputSchema>;

export const ListPendingRequestsInputSchema = z.object({
  type: z.enum(['pin', 'taxonomy']).optional().describe('Filter by request type'),
});
export type ListPendingRequestsInput = z.infer<typeof ListPendingRequestsInputSchema>;

export const ReviewRequestInputSchema = z.object({
  requestId: z.string().describe('ID of the pending request being reviewed'),
  decision: z.enum(['approve', 'approve_with_edits', 'reject']).describe('Review decision'),
  critiqueOrSuggestions: z.string().min(5).describe('Constructive feedback or reasoning for the decision'),
  editedPin: PinToWallInputSchema.optional().describe('Corrected pin data if decision is approve_with_edits'),
});
export type ReviewRequestInput = z.infer<typeof ReviewRequestInputSchema>;

export const OrganizeWallInputSchema = z.object({
  action: z.enum(['edit', 'archive']).describe('Organization action to perform'),
  pinId: z.string().describe('Target pin ID'),
  updates: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      module: z.string().optional(),
      tags: z.array(z.string()).optional(),
      category: PinCategorySchema.optional(),
    })
    .optional()
    .describe('Field updates if action is edit'),
});
export type OrganizeWallInput = z.infer<typeof OrganizeWallInputSchema>;

// ==========================================
// 2. KANBAN & ORCHESTRATOR SCHEMAS
// ==========================================

export const CreateTicketInputSchema = z.object({
  title: z.string().min(3).max(120).describe('Title of the task ticket'),
  description: z.string().min(10).describe('Full task description and requirements'),
  parentTicketId: z.string().optional().describe('Parent ticket ID if this is a child task or bug fix'),
  module: z.string().optional().describe('Module associated with this task'),
});
export type CreateTicketToolInput = z.infer<typeof CreateTicketInputSchema>;

export const SteerTaskInputSchema = z.object({
  ticketId: z.string().describe('ID of the ticket to steer'),
  guidancePrompt: z.string().optional().describe('Course-correction instructions to inject into the agent session'),
  updateTitle: z.string().optional().describe('New title for the ticket if renaming'),
  updateDescription: z.string().optional().describe('Updated description for the ticket'),
  renameWorktreeSlug: z.string().optional().describe('New slug/branch name for the worktree'),
});
export type SteerTaskToolInput = z.infer<typeof SteerTaskInputSchema>;

export const InspectTaskInputSchema = z.object({
  ticketId: z.string().describe('ID of the ticket to inspect'),
  includeDiff: z.boolean().default(true).describe('Include git diff between ticket branch and main'),
  includeThoughtLogs: z.boolean().default(true).describe('Include worker reasoning steps and tool logs'),
});
export type InspectTaskToolInput = z.infer<typeof InspectTaskInputSchema>;

export const ManageTicketInputSchema = z.object({
  ticketId: z.string().describe('ID of the ticket'),
  action: z.enum(['approve_and_merge', 'request_iteration', 'delete']).describe('Action: complete and merge to main, return for iteration, or permanently delete ticket'),
  iterationFeedback: z.string().optional().describe('Feedback required when requesting iteration'),
});
export type ManageTicketToolInput = z.infer<typeof ManageTicketInputSchema>;

export const GetBoardStatusInputSchema = z.object({
  moduleFilter: z.string().optional().describe('Optional module filter'),
});
export type GetBoardStatusToolInput = z.infer<typeof GetBoardStatusInputSchema>;

export const ListWorkspaceInputSchema = z.object({
  subPath: z.string().default('').describe('Subdirectory relative to workspace root'),
  maxDepth: z.number().int().min(1).max(4).default(2).describe('Depth of directory traversal'),
});
export type ListWorkspaceToolInput = z.infer<typeof ListWorkspaceInputSchema>;
