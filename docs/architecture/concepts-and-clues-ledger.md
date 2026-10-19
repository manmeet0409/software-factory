# Software Factory: Living Concepts & Clues Ledger

> **Status**: Living Document (Updated iteratively after each discussion)  
> **Purpose**: Captures concepts, ideas, structural clues, architectural insights, and critiques discussed with the founder. Each concept starts as a **clue/pointer** and is progressively refined into concrete engineering specifications.

---

## 🏛️ The Three Pillars Architecture

### 1. The Board (Execution & Worktrees)
* **Status**: Core Implemented (`KanbanBoard`, isolated git worktrees).
* **Role**: Tracks active work items, status progression (`pending` → `in_progress` → `agent_done` → `agent_tested` → `user_tested` → `done`), and isolated worktree branches.
* **Clues & Iteration Notes**:
  - [x] Worktree isolation keeps `main` branch clean while agents code.
  - [ ] Need support for multi-agent review comments and iteration requests before merge.

### 2. The Wall (Shared Memory & Constraints)
* **Status**: Core Implemented (`WallBoard`, `wallPins` in SQLite).
* **Role**: Cross-agent persistent knowledge base storing architecture decisions, system facts, and strict constraints.
* **Clues & Iteration Notes**:
  - [x] Orchestrator can directly pin facts or request pins.
  - [x] Wall pins created by Orchestrator can be selectively undone if a chat turn is reverted.
  - [ ] Need automatic constraint checking: before a Builder or Planner proceeds, they must query The Wall for relevant rules.

### 3. Tester's Den (Feature Contracts & Browser Regression)
* **Status**: Conceptual / Designing.
* **Role**: The permanent repository of feature test cases and user journeys that must never break.
* **Clues & Iteration Notes**:
  - **The "Silent Regression" Problem**: AI coding agents have tunnel vision; when modifying one feature, they frequently break adjacent code or styles without knowing.
  - **Not Just Unit Tests**: Must include real **Browser Agent E2E Tests** (via Playwright / headless Chrome) that navigate, click, fill forms, and assert visual/UI state.
  - **Selective Triggering**: Tag test suites with modules/file paths (e.g. `chat`, `auth`, `settings`). When code changes in a worktree, only relevant tests run—not a 30-minute full suite.
  - **Edge-Case Guards**:
    - Avoid shared DB state pollution (use isolated test databases or rollback transactions).
    - Avoid dev-server concurrency lock (test worktrees on dedicated ephemeral ports).
    - Distinguish intentional redesigns from unintentional regressions.
    - Max 2-retry self-healing limit to prevent token-burning loops.

### 4. Docs / Doc Space (Top-Level Navigation Tab alongside The Board & The Wall)
* **Status**: Core Implemented (`DocSpace`, `DocViewer`, `DocFileTree`, `/api/docs`).
* **Role**: A dedicated top-level section in the factory navigation bar (`[Workflow Board] [The Wall] [Docs] [Sessions]`).
* **Workspace Experience**:
  - The permanent left-hand **Chat Panel** remains accessible for real-time conversation with the `@architect` or `@orchestrator`.
  - The main area switches to the **Docs Workspace**, consisting of:
    1. **Doc Viewer (Center)**: Renders the active document with high-clarity markdown, Mermaid flowcharts, state diagrams, and contract definitions.
    2. **Docs File Tree (Right Sidebar)**: Lists and categorizes all documents in `/docs/**` (e.g. `PRDs`, `System Architecture`, `API Contracts`, `Specifications`) with live search and 1-click switching.
* **Layout Blueprint**:
  ```
  Top Bar: [Workflow Board]  [The Wall]  [Docs]  [Sessions]
  ─────────────────────────────────────────────────────────────────────────────
  ┌──────────────────┬─────────────────────────────────┬──────────────────────┐
  │   [Chat Panel]   │          [Doc Viewer]           │   [Docs File Tree]   │
  │                  │                                 │                      │
  │  Discuss ideas   │  - Visual Mermaid Flows         │  📁 docs/            │
  │  with Architect  │  - Interactive State Machines   │    ├── prd.md        │
  │  to refine docs  │  - Concise Contract Tables      │    ├── arch.md       │
  │                  │  - Real-time live reload        │    └── contracts/    │
  └──────────────────┴─────────────────────────────────┴──────────────────────┘
  ```
* **Clues & Iteration Notes**:
  - **Founder-Friendly**: Must be **super concise**—avoid walls of developer text; maximize visual flowcharts, sequence diagrams, tables, and state graphs.
  - **Mermaid & Visual-First**: Render rich interactive Mermaid diagrams (state machines, system flows, user journeys) directly inline.
  - **Real-Time Sync**: When `@architect` generates or updates a doc in `/docs`, the viewer updates immediately.
  - **Living File Tree**: Lists all files in `/docs/**` (e.g. `prd.md`, `system-architecture.md`, `contracts/api.ts`) with quick switching.

---

## 🤖 The Evolved Multi-Agent Hierarchy

### A. Front-Door & Discovery Layer
* **User (Product Owner / Founder)**:
  - Non-developer perspective; owns the ideas, business logic, user flow, and expectations.
* **Orchestrator (Liaison & SDLC Traffic Controller)**:
  - Chat interface lead.
  - Directly handles operational queries, system checks, and triage.
  - Routes deep product ideation to `@architect` and task execution to `@manager`.
* **System Architect / Product Analyst (`@architect`)** *(New Concept)*:
  - **Purpose**: Helps the non-dev user flesh out raw ideas into exact specifications without developer jargon.
  - **Responsibilities**:
    - Conducts iterative conversational requirement elicitation.
    - Discovers platform, hardware, and OS constraints (e.g. mobile overlay permissions, browser extension limits, on-device ML latency).
    - Produces structured output: `prd.md`, `system-architecture.md`, `api-contracts.ts`, and core Wall pins.
    - Populates the **Doc Space** with visual, diagram-rich documentation.
  - **Architect ↔ Planner Advisory Loop**:
    - Before finalizing a spec, `@architect` can consult `@planner` as an advisory subagent.
    - **What Planner checks for Architect**:
      - *Codebase Blast Radius*: Which existing files, components, or DB tables will be impacted?
      - *Technical Sequencing*: What prerequisite libraries, schema migrations, or refactors are required first?
      - *Ticket Sizing & Phasing*: Helps the Architect structure the spec into feasible Phase 1 / Phase 2 deliverables.
    - Result: The resulting PRD and architecture blueprint are grounded in engineering reality, not just abstract product theory.
  - **Loop-Buster Guard (Preventing Infinite Agent Ping-Pong)**:
    - *The Risk*: Two reasoning models can easily fall into an endless debate over architectural nuance, burning tokens and causing massive latency.
    - *Enforced Guardrails*:
      1. **1-Turn Request/Response Protocol**: Architect submits a single structured query (`proposal`, `assumedStack`); Planner returns a single structured advisory memo (`blastRadius`, `dependencies`, `complexity`).
      2. **Hard Cap (Max 1 Follow-up)**: If a blocker is flagged, Architect is allowed at most **one** follow-up turn to propose an alternative. No third iteration permitted.
      3. **Asymmetric Authority**: Planner is an **advisor**, not a gatekeeper. Architect holds final spec authority and resolves ties.
      4. **Zero Code Generation at Discovery**: Planner inspects file trees, ASTs, and schemas only—never generates implementation code during discovery.
      5. **Escalate Trade-Offs to Founder**: If Planner identifies a massive architectural roadblock, Architect immediately bubbles up a clear, non-technical choice to the Founder in chat (*"Option A: Quick integration with trade-off vs Option B: Deeper refactor"*).
  - **Planner Session Affinity & Context Hygiene Policy**:
    - Architect explicitly manages Planner session lifecycle based on task continuity:
      - **Warm Session (Re-use Existing)**:
        - *Trigger*: Follow-up queries, refinements, or sizing for the *same* feature.
        - *Benefit*: Planner already retains codebase structure, dependencies, and file paths in its context window. Avoids repetitive file reads and cuts token burn and response latency.
      - **Cold Session (Spin Fresh Instance)**:
        - *Trigger*: Brand new feature discussions, orthogonal domain switches, or when prior architectural assumptions were rejected.
        - *Benefit*: Guarantees zero context contamination or cognitive bias from previous debates, ensuring completely objective feasibility assessments.

### B. Execution & Engineering Layer
* **Manager (`@manager`)**:
  - Takes approved specs/PRDs from Architect/Orchestrator and decomposes them into atomic tickets on The Board.
  - Coordinates worker subagents inside isolated git worktrees.
* **Planner (`@planner`)**:
  - Consulted by `@architect` during discovery for technical feasibility.
  - Generates low-level implementation roadmaps (file paths, dependency order, function signatures) once tickets are scheduled.
* **Builder (`@builder`)**:
  - Writes code in `src/` and unit tests in `tests/` within isolated worktrees.

### C. Critique & Validation Layer *(New Concept)*
* **Tester (`@tester` + Tester's Den)**:
  - Executes unit/integration test suites and browser E2E test recipes from Tester's Den.
  - Captures run logs and failure screenshots.
* **Architect Critique / Senior Staff Reviewer (`@reviewer` evolved)**:
  - **State Management Audit**: Scrutinizes where state lives (avoids accidental re-renders, leaky globals, or fragile prop drilling). "If agent thinks it's right, think again."
  - **Security & Pentest Audit**: Checks for injection vulnerabilities, token leaks, permission bounds, input sanitization.
  - **Scalability & Extensibility**: Asks *"Will this architecture create future restraints or block future features?"*
  - **Code Quality**: Enforces commenting, modularity, and clean separation of concerns.
* **Big-Picture Intent Auditor (`@intent-auditor`)**:
  - **Purpose**: Combats LLM hallucination and tunnel vision during feature implementation.
  - **Responsibilities**:
    - Evaluates the final implementation against the **original user chat prompt** and agreed PRD.
    - If fully aligned: moves ticket to `agent_tested` and presents to user for one-click approval.
    - If ambiguous or confused: invokes Orchestrator to ask the user a targeted clarifying question, passes the answer back, and routes a child ticket or revision back to `@builder`.

### D. Governance & Cross-Doc Consistency Layer *(New Concept)*
* **Doc Alignment Auditor / Specification Arbiter (`@doc-auditor`)**:
  - **Purpose**: Continuously monitors the `/docs/**` repository to detect contract drift, schema mismatches, and requirement conflicts across different documents.
  - **Execution & Lifecycle Model (Ephemeral Cron)**:
    - **Schedule**: Triggers automatically on a **30-minute cron interval** (`*/30 * * * *`).
    - **Ephemeral / Vanishing Sessions**: Runs inside a dedicated temporary session to preserve context budget and avoid memory bloat.
      - **Clean Run**: If all documents are consistent, logs a silent verification heartbeat and **vanishes immediately** (session destroyed).
      - **Discrepancy Found**: Emits structured finding to `@architect`, then the auditor session **vanishes immediately**. The issue is carried forward exclusively by `@architect`.
  - **What It Cross-Checks**:
    - Does `prd.md` specify a feature that contradicts `system-architecture.md`? (e.g. PRD says "offline support", Architecture says "direct cloud DB connection").
    - Do TypeScript interface definitions in `contracts/api.ts` match the payloads described in `specs/endpoints.md`?
    - Does a new document violate pinned architecture rules on **The Wall**?
  - **Inconsistency Resolution Pipeline**:
    ```
    1. [@doc-auditor] (ephemeral session spawns every 30m) detects doc conflict / flaw
           │
           ├─► Hands off findings to [@architect]
           │
           ▼
    [@doc-auditor session vanishes / self-destructs]
           │
           ▼
    2. [@architect] receives report, reviews spec intent & feasibility
           │
           ▼
    3. [@manager] evaluates engineering reality & active worktrees
           │
           ├─► Real Flaw Confirmed?
           │        │
           │        ▼
           │   [@orchestrator] is alerted to dispatch:
           │        ├── Creates new ticket on The Board
           │        └── Or attaches child ticket / review comment to active worktree
           │
           └─► Ambiguous Product Tradeoff?
                    │
                    ▼
               [@orchestrator] pauses and prompts User (Founder) for decision
    ```

---

## 💡 Concept Case Studies

### Case 1: "Pushups-to-Scroll" (Physical Habit Reel Blocker)
* **Raw User Clue**: User must do pushups in front of camera to earn Instagram reel scrolls. 1 pushup = 1 scroll. Overlay blocks screen or takes user home if out of scrolls. Swipes are tracked.
* **Pointers & Architectural Questions**:
  1. **Platform Selection**:
     - *Web Extension*: Runs inside Instagram Web in Chrome. Easiest overlay and DOM scroll interception; webcam access via standard WebRTC.
     - *Mobile App (Android)*: Requires `SYSTEM_ALERT_WINDOW` permission and Android Accessibility Service to track swipes on native Instagram app.
     - *Mobile App (iOS)*: Extremely restricted; native overlay over third-party apps is blocked by Apple sandbox.
  2. **Computer Vision & Privacy**:
     - On-device pose detection via MediaPipe / TensorFlow.js. Zero video frames sent to servers (privacy-first).
     - Rep counting via elbow-to-shoulder angle deflection (< 90° contraction, > 160° extension).
  3. **State Machine**:
     - `Idle` → `CameraActive` → `RepCounted (Token +1)` → `ScrollUnlocked` → `SwipeDetected (Token -1)` → `Lockout / Overlay`.

---

## 📝 Change Log & Iteration Pointers

| Version | Date | Clue / Pointer Added | Status |
| :--- | :--- | :--- | :--- |
| **0.1.0** | 2026-10-18 | Initial Ledger: Tester's Den, 3-Pillars, Architect, Critique, Intent Auditor, Pushup-to-Scroll Case Study. | Active |
| **0.2.0** | 2026-10-18 | Added 4th Pillar: **Doc Space** with 3-Pane Layout (`[Chat] - [Doc Viewer] - [Docs File Tree]`) & visual diagram mandates. | Active |
| **0.3.0** | 2026-10-18 | Added Governance Role: **Doc Alignment Auditor (`@doc-auditor`)** for cross-doc consistency and 3-tier escalation hierarchy. | Active |
| **0.4.0** | 2026-10-18 | Defined Inconsistency Resolution Pipeline: `Doc Auditor` → `Architect` → `Manager` (verifies flaw) → `Orchestrator` (dispatches ticket/comment/child ticket). | Active |
| **0.5.0** | 2026-10-18 | Added **30-minute cron interval** & **ephemeral vanishing session model** for `@doc-auditor` (spawns, verifies, reports to `@architect` if flawed, and self-destructs). | Active |
| **0.6.0** | 2026-10-18 | **Doc Space Pillar Implemented**: 3-pane layout, `/docs` directory scanner, missing folder init CTA, Markdown/Mermaid editor & preview toggle, and save support. | Implemented |
| **0.7.0** | 2026-10-19 | Added **Architect ↔ Planner Advisory Loop**: `@architect` consults `@planner` on blast radius, technical sequencing, and phasing before finalizing specs. | Active |
| **0.8.0** | 2026-10-19 | Added **Loop-Buster Guard**: Enforced 1-turn request/memo protocol, max 1 follow-up cap, asymmetric authority, and escalation of trade-offs to founder to eliminate infinite agent debate. | Active |
| **0.9.0** | 2026-10-19 | Added **Planner Session Affinity & Hygiene Policy**: Architect decides whether to keep warm session (avoids re-reading codebase for related queries) or spin cold session (prevents context contamination and bias). | Active |
