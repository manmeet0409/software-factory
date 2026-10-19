# OpenCode v2.0 Updates & Architecture Integration

Reference guide for OpenCode v2.0+ (specifically **v2.0.29**) capabilities and integration points within the Software Factory orchestration system.

---

## 1. Core Architectural Changes

* **Effect Runtime**: Core execution loop rewritten with Effect, drastically cutting memory consumption and making 5 concurrent instances (1 Orchestrator + 4 Workers) RAM-stable.
* **Dynamic Location-Scoped Configuration**: `opencode.json` and agent markdown configs load relative to the specific worktree/folder rather than the global daemon launch directory.
* **Auto-Reloading**: Subagent prompt configs, skills, and permissions hot-reload without killing/restarting daemon processes.

---

## 2. Agent Client Protocol (ACP) Updates

* **Child-Session Updates (`opencode/child-session-updates`)**:
  - Emitted when `manager` delegates tasks to `@planner`, `@builder`, `@tester`, or `@reviewer`.
  - Can be streamed directly into the Kanban activity feed via `session/update`.
* **Prompt Capabilities**:
  - `embeddedContext`: Directly embeds file context and markdown specifications into prompts.
* **Session Lifecycle**:
  - `fork`: Branch an active session for iterations or bug fixes without losing prior context.
  - `resume` & `loadSession`: Retain and recover session state across factory server restarts.
  - `compact`: Built-in auto-compaction and `/api/session/{id}/compact` endpoint to control context window and token usage.

---

## 3. Worktree & VCS Management

* **Native `/api/worktree` Endpoints**:
  - `POST /api/worktree`: Creates isolated worktree using the project's strategy.
  - `GET /api/worktree`: Lists active worktrees.
  - `DELETE /api/worktree`: Removes worktree and runs cleanup.
  - `POST /api/worktree/refresh`: Synchronizes worktree inventory across git roots.
* **VCS Isolation**: Built-in support alongside our custom `WorktreeManager` (`../software-factory-worktrees/`).

---

## 4. Concurrency & Daemon Isolation

* **`--standalone` Flag**:
  - Starts private server instances per worker process.
  - Prevents SQLite database lock contention on `%LOCALAPPDATA%\opencode\opencode.db`.
* **`--auto` Flag**:
  - Globally auto-approves permissions not explicitly denied in agent configs.
* **SSE Event Stream (`/api/event`)**:
  - Direct HTTP streaming of agent steps, tool executions, and state changes.

---

## 5. Implementation Roadmap for Software Factory

1. **Child Session Streaming**: Update `src/lib/acp/client.ts` to forward `child-session-updates` to `eventBus`.
2. **Worker Isolation**: Pass `--standalone` to `ACPClient` spawns to eliminate SQLite concurrency issues.
3. **Session Forking for Bug Fixes**: Leverage session `fork` when creating child tickets from completed work.
