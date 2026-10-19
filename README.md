# Software Factory

Autonomous software development lifecycle (SDLC) factory powered by **Next.js 16**, **OpenCode v2.0+ (ACP)**, and **Git Worktree Isolation**.

---

## Architecture Overview

* **Factory Orchestrator**: Conversational agent coordinating the Kanban board and multi-turn planning.
* **Worker Agents**: OpenCode team (`manager`, `planner`, `builder`, `tester`, `reviewer`).
* **Worktree Isolation**: Each active task executes in a dedicated git worktree (`../software-factory-worktrees/<ticketId>`), merging into `main` upon approval.
* **Concurrency Cap**: Up to 4 active worker agents + 1 orchestrator session (5 maximum).
* **Database**: SQLite WAL mode with Drizzle ORM tracking tickets, comments, activity logs, and chat chains.

---

## OpenCode v2.0 Integration

See [docs/OPENCODE_UPDATES.md](docs/OPENCODE_UPDATES.md) for details on OpenCode v2.0.29 capabilities:
* Native `worktree` and `session` management endpoints
* Effect architecture with reduced RAM footprint
* Subagent child-session streaming via ACP (`opencode/child-session-updates`)
* `--standalone` mode for database lock isolation

---

## Quickstart

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the factory dashboard.
