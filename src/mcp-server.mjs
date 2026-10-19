import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.join(projectRoot, 'data', 'factory.db');

// Ensure db directory
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const server = new McpServer({
  name: 'software-factory',
  version: '1.0.0',
});

// Helper: Get target directory
function getTargetDir() {
  const wsPath = path.join(projectRoot, 'data', 'workspace.json');
  if (fs.existsSync(wsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(wsPath, 'utf-8'));
      if (data.targetDirectory && fs.existsSync(data.targetDirectory)) {
        return data.targetDirectory;
      }
    } catch {
      // ignore
    }
  }
  return projectRoot;
}

// ==========================================
// 1. THE WALL TOOLS
// ==========================================

server.tool(
  'read_wall',
  'Read pinned facts, architectural logic, and debugging lessons from The Wall shared knowledge base.',
  {
    module: z.string().optional().describe('Filter pins by module name (e.g. "core", "database", "ui")'),
    category: z.enum(['fact', 'logic', 'lesson']).optional().describe('Filter by category: fact, logic, or lesson'),
    searchQuery: z.string().optional().describe('Search term against titles and descriptions'),
    includeArchived: z.boolean().optional().describe('Whether to include archived pins (default false)'),
    archivedOnly: z.boolean().optional().describe('Whether to search only archived pins (default false)'),
  },
  async ({ module, category, searchQuery, includeArchived, archivedOnly }) => {
    let query = 'SELECT * FROM wallPins WHERE 1=1';
    if (archivedOnly) {
      query += ' AND archived = 1';
    } else if (!includeArchived) {
      query += ' AND archived = 0';
    }
    const params = [];

    if (module) {
      query += ' AND module = ?';
      params.push(module);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (searchQuery) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    query += ' ORDER BY createdAt DESC LIMIT 50';
    const rows = db.prepare(query).all(...params);

    const formatted = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      module: r.module,
      tags: JSON.parse(r.tags || '[]'),
      createdBy: r.createdBy,
      createdAt: new Date(r.createdAt * 1000).toISOString(),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ count: formatted.length, pins: formatted }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'pin_to_wall',
  'Directly pin a permanent fact, architectural constraint, or lesson learned to The Wall.',
  {
    title: z.string().min(5).max(120).describe('Concise title for the pin'),
    description: z.string().min(10).describe('Detailed explanation of why this rule is binding'),
    category: z.enum(['fact', 'logic', 'lesson']).describe('Category: fact, logic, or lesson'),
    module: z.string().min(1).describe('Target module name (e.g. "core", "database", "ui")'),
    tags: z.array(z.string()).min(1).describe('Tags categorizing this pin'),
  },
  async ({ title, description, category, module, tags }) => {
    const now = Math.floor(Date.now() / 1000);
    const pinId = uuidv4();

    db.prepare(`
      INSERT INTO wallPins (id, title, description, category, module, tags, createdBy, createdAt, archived)
      VALUES (?, ?, ?, ?, ?, ?, 'orchestrator', ?, 0)
    `).run(pinId, title, description, category, module, JSON.stringify(tags), now);

    return {
      content: [
        {
          type: 'text',
          text: `Successfully pinned to The Wall: "${title}" (ID: ${pinId.slice(0, 8)})`,
        },
      ],
    };
  }
);

server.tool(
  'request_pin_to_wall',
  'Submit a proposal for a new fact or lesson to be reviewed before pinning to The Wall.',
  {
    title: z.string().min(5).max(120).describe('Title of the proposed truth'),
    description: z.string().min(10).describe('Explanation of the finding or rule'),
    category: z.enum(['fact', 'logic', 'lesson']).describe('Category: fact, logic, or lesson'),
    module: z.string().min(1).describe('Target module name'),
    tags: z.array(z.string()).min(1).describe('Tags for the proposed pin'),
    reasoning: z.string().min(5).describe('Why this should be shared with all other agents'),
  },
  async ({ title, description, category, module, tags, reasoning }) => {
    const now = Math.floor(Date.now() / 1000);
    const reqId = uuidv4();
    const payload = JSON.stringify({ title, description, category, module, tags, reasoning });

    db.prepare(`
      INSERT INTO wallRequests (id, type, submittedBy, status, payload, createdAt)
      VALUES (?, 'pin', 'orchestrator', 'pending', ?, ?)
    `).run(reqId, payload, now);

    return {
      content: [
        {
          type: 'text',
          text: `Wall proposal submitted for review: "${title}" (Request ID: ${reqId.slice(0, 8)})`,
        },
      ],
    };
  }
);

server.tool(
  'manage_wall',
  'Manage pins on The Wall: archive a pin, clear all active pins, or remove outdated guidelines.',
  {
    action: z.enum(['archive_pin', 'unarchive_pin', 'clear_all']).describe('Action: archive a pin, unarchive/restore a pin, or clear all active pins'),
    pinId: z.string().optional().describe('Pin ID to archive or unarchive (required when action is archive_pin or unarchive_pin)'),
  },
  async ({ action, pinId }) => {
    if (action === 'clear_all') {
      const res = db.prepare('UPDATE wallPins SET archived = 1 WHERE archived = 0').run();
      return {
        content: [
          {
            type: 'text',
            text: `Successfully cleared The Wall: archived ${res.changes} pin(s).`,
          },
        ],
      };
    }
    if (action === 'archive_pin') {
      if (!pinId) {
        return { content: [{ type: 'text', text: 'Error: pinId is required to archive a pin.' }] };
      }
      const res = db.prepare('UPDATE wallPins SET archived = 1 WHERE id = ? OR id LIKE ?').run(pinId, `${pinId}%`);
      return {
        content: [
          {
            type: 'text',
            text: `Archived pin matching "${pinId}". Modified ${res.changes} record(s).`,
          },
        ],
      };
    }
    if (action === 'unarchive_pin') {
      if (!pinId) {
        return { content: [{ type: 'text', text: 'Error: pinId is required to unarchive a pin.' }] };
      }
      const res = db.prepare('UPDATE wallPins SET archived = 0 WHERE id = ? OR id LIKE ?').run(pinId, `${pinId}%`);
      return {
        content: [
          {
            type: 'text',
            text: `Unarchived pin matching "${pinId}". Restored ${res.changes} pin(s) back to active view.`,
          },
        ],
      };
    }
    return {
      content: [{ type: 'text', text: 'Unknown action' }],
    };
  }
);

// ==========================================
// 2. KANBAN & TASK MANAGEMENT TOOLS
// ==========================================

server.tool(
  'get_board_status',
  'Get the full status of tasks across all Kanban workflow columns (pending, in_progress, agent_done, agent_tested, user_tested, done).',
  {
    moduleFilter: z.string().optional().describe('Filter tasks containing module name in description'),
  },
  async ({ moduleFilter }) => {
    const rows = db.prepare('SELECT * FROM tickets ORDER BY createdAt DESC').all();

    const filtered = moduleFilter
      ? rows.filter((r) => r.description && r.description.toLowerCase().includes(moduleFilter.toLowerCase()))
      : rows;

    const summary = {
      total: filtered.length,
      pending: filtered.filter((r) => r.status === 'pending').map((t) => ({ id: t.id.slice(0, 8), title: t.title })),
      in_progress: filtered.filter((r) => r.status === 'in_progress').map((t) => ({ id: t.id.slice(0, 8), title: t.title, worktree: t.worktreeDir })),
      agent_done: filtered.filter((r) => r.status === 'agent_done').map((t) => ({ id: t.id.slice(0, 8), title: t.title })),
      agent_tested: filtered.filter((r) => r.status === 'agent_tested').map((t) => ({ id: t.id.slice(0, 8), title: t.title })),
      user_tested: filtered.filter((r) => r.status === 'user_tested').map((t) => ({ id: t.id.slice(0, 8), title: t.title })),
      done: filtered.filter((r) => r.status === 'done').map((t) => ({ id: t.id.slice(0, 8), title: t.title })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_ticket',
  'Create a new task ticket in the Software Factory development pipeline.',
  {
    title: z.string().min(3).max(120).describe('Title of the task ticket'),
    description: z.string().min(10).describe('Detailed requirements, acceptance criteria, and files to touch'),
    parentTicketId: z.string().optional().describe('Parent ticket ID if this is a subtask'),
    assignedModel: z.string().optional().describe('Model override (e.g. opencode/nemotron-3.5-lightning-free)'),
  },
  async ({ title, description, parentTicketId, assignedModel }) => {
    const now = Math.floor(Date.now() / 1000);
    const ticketId = uuidv4();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO tickets (id, title, description, status, parentTicketId, assignedModel, createdAt, updatedAt)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
      `).run(ticketId, title, description, parentTicketId || null, assignedModel || null, now, now);

      db.prepare(`
        INSERT INTO activityLogs (id, ticketId, action, actor, summary, timestamp)
        VALUES (?, ?, 'created', 'orchestrator', ?, ?)
      `).run(uuidv4(), ticketId, `Task "${title}" created by orchestrator`, now);
    })();

    return {
      content: [
        {
          type: 'text',
          text: `Task ticket #${ticketId.slice(0, 8)} created: "${title}". Status is now pending in the Kanban board.`,
        },
      ],
    };
  }
);

server.tool(
  'inspect_task',
  'Inspect full ticket details, description, review comments, activity history, and git branch.',
  {
    ticketId: z.string().describe('Full or 8-char prefix ID of the ticket'),
  },
  async ({ ticketId }) => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? OR id LIKE ?').get(ticketId, `${ticketId}%`);
    if (!ticket) {
      return {
        content: [{ type: 'text', text: `Error: Ticket with ID matching "${ticketId}" not found.` }],
      };
    }

    const comments = db.prepare('SELECT * FROM comments WHERE ticketId = ? ORDER BY createdAt ASC').all(ticket.id);
    const activityLogs = db.prepare('SELECT * FROM activityLogs WHERE ticketId = ? ORDER BY timestamp ASC').all(ticket.id);

    const details = {
      ticket: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        worktreeDir: ticket.worktreeDir,
        assignedModel: ticket.assignedModel,
        createdAt: new Date(ticket.createdAt * 1000).toISOString(),
      },
      comments: comments.map((c) => ({
        author: c.author,
        type: c.type,
        content: c.content,
        time: new Date(c.createdAt * 1000).toLocaleTimeString(),
      })),
      activityLogs: activityLogs.map((l) => ({
        action: l.action,
        actor: l.actor,
        summary: l.summary,
        time: new Date(l.timestamp * 1000).toLocaleTimeString(),
      })),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
    };
  }
);

server.tool(
  'manage_ticket',
  'Manage a ticket: approve & merge to main, request iteration, or delete ticket.',
  {
    ticketId: z.string().describe('Full or prefix ID of the ticket'),
    action: z.enum(['approve_and_merge', 'request_iteration', 'delete']).describe('Action to perform'),
    iterationFeedback: z.string().optional().describe('Feedback required when requesting iteration'),
  },
  async ({ ticketId, action, iterationFeedback }) => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? OR id LIKE ?').get(ticketId, `${ticketId}%`);
    if (!ticket) {
      return {
        content: [{ type: 'text', text: `Error: Ticket "${ticketId}" not found.` }],
      };
    }

    const now = Math.floor(Date.now() / 1000);

    if (action === 'delete') {
      db.prepare('DELETE FROM tickets WHERE id = ?').run(ticket.id);
      return {
        content: [{ type: 'text', text: `Ticket #${ticket.id.slice(0, 8)} ("${ticket.title}") was permanently deleted.` }],
      };
    }

    if (action === 'approve_and_merge') {
      db.prepare('UPDATE tickets SET status = ?, updatedAt = ? WHERE id = ?').run('done', now, ticket.id);
      db.prepare(`
        INSERT INTO activityLogs (id, ticketId, action, fromStatus, toStatus, actor, summary, timestamp)
        VALUES (?, ?, 'completed', ?, 'done', 'orchestrator', 'Ticket approved and marked done', ?)
      `).run(uuidv4(), ticket.id, ticket.status, now);

      return {
        content: [{ type: 'text', text: `Ticket #${ticket.id.slice(0, 8)} approved and moved to Done.` }],
      };
    }

    if (action === 'request_iteration') {
      if (!iterationFeedback) {
        return {
          content: [{ type: 'text', text: 'Error: iterationFeedback is required when requesting iteration.' }],
        };
      }

      db.transaction(() => {
        db.prepare('UPDATE tickets SET status = ?, updatedAt = ? WHERE id = ?').run('in_progress', now, ticket.id);
        db.prepare(`
          INSERT INTO comments (id, ticketId, author, content, type, createdAt)
          VALUES (?, ?, 'orchestrator', ?, 'feedback', ?)
        `).run(uuidv4(), ticket.id, iterationFeedback, now);
        db.prepare(`
          INSERT INTO activityLogs (id, ticketId, action, fromStatus, toStatus, actor, summary, timestamp)
          VALUES (?, ?, 'moved', ?, 'in_progress', 'orchestrator', 'Returned for iteration with feedback', ?)
        `).run(uuidv4(), ticket.id, ticket.status, now);
      })();

      return {
        content: [{ type: 'text', text: `Ticket #${ticket.id.slice(0, 8)} returned to in_progress with feedback.` }],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown action: ${action}` }],
    };
  }
);

server.tool(
  'list_workspace',
  'Inspect the current target project workspace files and structure.',
  {
    subPath: z.string().default('').describe('Subdirectory relative to workspace root'),
    maxDepth: z.number().int().min(1).max(3).default(2).describe('Depth of traversal'),
  },
  async ({ subPath, maxDepth }) => {
    const baseDir = getTargetDir();
    const targetPath = path.resolve(baseDir, subPath || '');

    if (!fs.existsSync(targetPath)) {
      return {
        content: [{ type: 'text', text: `Error: Path "${targetPath}" does not exist.` }],
      };
    }

    function walk(dir, currentDepth) {
      if (currentDepth > maxDepth) return [];
      const items = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (['node_modules', '.git', '.next', 'dist'].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);
          if (entry.isDirectory()) {
            items.push({ type: 'dir', path: rel });
            items.push(...walk(full, currentDepth + 1));
          } else {
            items.push({ type: 'file', path: rel });
          }
        }
      } catch {
        // ignore
      }
      return items;
    }

    const structure = walk(targetPath, 1);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ workspace: baseDir, count: structure.length, files: structure }, null, 2),
        },
      ],
    };
  }
);

// Connect stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
