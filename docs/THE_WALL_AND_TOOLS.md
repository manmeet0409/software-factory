# The Wall & Agent Tool Architecture

Specification for **The Wall** (Shared Knowledge Board) and role-scoped tool access across the Software Factory.

---

## 1. Concept: The Wall (Shared Knowledge Board)

**The Wall** is a centralized, shared blackboard where agents record verified facts, design decisions, architectural logic, and lessons learned across the lifecycle of all tasks.

### Pin Schema
* **Title**: Concise heading of the finding/fact.
* **Description**: Markdown explanation of the logic, discovery, or rule.
* **Category**: `'fact'` | `'logic'` | `'lesson'`.
* **Module**: Must belong to an authorized set of project modules (e.g., `auth`, `database`, `api`, `ui`).
* **Tags**: Must belong to an authorized set of controlled tags (e.g., `performance`, `security`, `concurrency`, `breaking-change`).
* **CreatedBy**: Agent identifier (`manager`, `orchestrator`, etc.).
* **Timestamp**: Unix timestamp.

---

## 2. Taxonomy & Pinning Governance

1. **Controlled Taxonomy**: Tags and Modules cannot be created ad-hoc by builders to avoid fragmentation.
2. **Builder Proposes, Manager Disposes**:
   * If a tag or module is missing, `builder` must call `request_taxonomy` with justification.
   * `manager` critically evaluates the request: approves, rejects, or suggests existing alternatives.
3. **Curation Gate**:
   * `builder` cannot pin directly to the Wall.
   * `builder` calls `request_pin_to_wall`. The `manager` reviews the pin to verify it is a genuine fact, logic, or lesson before publishing.
4. **Maintenance**:
   * `manager` actively reorganizes, merges, and archives outdated pins (`organize_wall`).

---

## 3. Tool Access by Agent Role

| Tool Name | Allowed Callers | Purpose |
| :--- | :--- | :--- |
| **`read_wall`** | All Agents | Query pinned facts, logic, and lessons filtered by module/tags |
| **`request_pin_to_wall`** | `builder` | Propose a pin to the Manager for critique and approval |
| **`pin_to_wall`** | `manager`, `orchestrator` | Directly publish a verified pin to the Wall |
| **`request_taxonomy`** | `builder` | Request addition of a new tag or module with rationale |
| **`manage_wall_taxonomy`** | `manager`, `orchestrator` | Approve, add, or edit allowed tags and modules |
| **`organize_wall`** | `manager`, `orchestrator` | Clean, deduplicate, or archive pins |
| **`create_ticket`** | `orchestrator` | Queue a task ticket on the Kanban board |
| **`steer_task`** | `orchestrator` | Inject mid-work guidance, rename branch/worktree, or edit ticket |
| **`inspect_task`** | `orchestrator` | Read-only inspection of worker diffs, briefings, and thought logs |
| **`manage_ticket`** | `orchestrator` | Move ticket to `Done` (merge to main) or return for iteration |
| **`get_board_status`** | `orchestrator` | Read all 6 Kanban columns and worker slot utilization |
| **`list_workspace`** | `orchestrator` | Read-only inspection of active project directory contents |
