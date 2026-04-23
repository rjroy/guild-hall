/**
 * CLI surface tree — single source of truth for the agent-first CLI layout.
 *
 * The tree is CLI-owned: its shape is independent of daemon route paths
 * (REQ-CLI-AGENT-1). Each leaf either references a real daemon `operationId`,
 * an aggregation sentinel, or the package-op fallback sentinel.
 *
 * See `.lore/specs/infrastructure/cli-agent-surface.md` and
 * `.lore/plans/infrastructure/cli-agent-surface.md` §Top-Level Layout.
 */

export const PHASE_LABELS = ["request", "run", "session", "generation"] as const;
export type PhaseLabel = (typeof PHASE_LABELS)[number];

export const AGGREGATE_SENTINEL = "__aggregate__";
export const PACKAGE_OP_SENTINEL = "__package_op__";
/**
 * Marker for leaves that run entirely in-process without touching the daemon
 * (e.g. `migrate-content`). The resolver routes these to a dedicated
 * local-command branch; `invocationForOperation` refuses to resolve them
 * because there is no HTTP surface to dispatch.
 */
export const LOCAL_COMMAND_SENTINEL = "__local__";

const ARTIFACT_DOCUMENT_WRITE_OP = "workspace.artifact.document.write";

export type CliArgType = "string";
export type CliFlagType = "string" | "boolean";

export interface CliArg {
  name: string;
  required: boolean;
  description: string;
  type: CliArgType;
}

export interface CliFlag {
  name: string;
  type: CliFlagType;
  default?: string;
  description: string;
}

export interface CliAggregate {
  operationIds: string[];
  justification: string;
}

export interface CliLeafNode {
  kind: "leaf";
  name: string;
  description: string;
  operationId: string;
  aggregate?: CliAggregate;
  args: CliArg[];
  flags?: CliFlag[];
  example: string;
  outputShape: string;
}

export interface CliGroupNode {
  kind: "group";
  name: string;
  description: string;
  children: CliNode[];
}

export type CliNode = CliGroupNode | CliLeafNode;

// -- Helpers used in tree construction --

function leaf(node: CliLeafNode): CliLeafNode {
  return node;
}

function group(node: CliGroupNode): CliGroupNode {
  return node;
}

// -- Top-level groups --

const projectGroup = group({
  kind: "group",
  name: "project",
  description: "Manage registered projects and their heartbeats.",
  children: [
    leaf({
      kind: "leaf",
      name: "list",
      description: "List every registered project.",
      operationId: "system.config.project.list",
      args: [],
      example: "guild-hall project list",
      outputShape: "{ projects: Array<{ name, path, group, status }> }",
    }),
    leaf({
      kind: "leaf",
      name: "read",
      description: "Read a single project's registration record.",
      operationId: "system.config.project.read",
      args: [{ name: "projectName", required: true, type: "string", description: "Registered project name." }],
      example: "guild-hall project read my-project",
      outputShape: "{ project: { name, path, group } }",
    }),
    leaf({
      kind: "leaf",
      name: "register",
      description: "Register a new project at the given path.",
      operationId: "system.config.project.register",
      args: [
        { name: "projectName", required: true, type: "string", description: "Unique project name." },
        { name: "path", required: true, type: "string", description: "Absolute path to the project root." },
      ],
      example: "guild-hall project register my-project /home/me/projects/my-project",
      outputShape: "{ project: { name, path } }",
    }),
    leaf({
      kind: "leaf",
      name: "deregister",
      description: "Remove a project from the registry.",
      operationId: "system.config.project.deregister",
      args: [{ name: "projectName", required: true, type: "string", description: "Project to remove." }],
      example: "guild-hall project deregister my-project",
      outputShape: "{ deregistered: string }",
    }),
    leaf({
      kind: "leaf",
      name: "group",
      description: "Assign a project to a display group.",
      operationId: "system.config.project.group",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "group", required: true, type: "string", description: "Group name (or empty to clear)." },
      ],
      example: "guild-hall project group my-project active",
      outputShape: "{ project: { name, group } }",
    }),
    group({
      kind: "group",
      name: "heartbeat",
      description: "Project heartbeat operations.",
      children: [
        leaf({
          kind: "leaf",
          name: "tick",
          description: "Record a heartbeat tick for a project.",
          operationId: "heartbeat.project.tick",
          args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
          example: "guild-hall project heartbeat tick my-project",
          outputShape: "{ tickedAt: string }",
        }),
        leaf({
          kind: "leaf",
          name: "status",
          description: "Read the latest heartbeat status for a project.",
          operationId: "heartbeat.project.status",
          args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
          example: "guild-hall project heartbeat status my-project",
          outputShape: "{ status, lastTickAt }",
        }),
      ],
    }),
  ],
});

const commissionGroup = group({
  kind: "group",
  name: "commission",
  description: "Create, list, dispatch, and manage commissions.",
  children: [
    leaf({
      kind: "leaf",
      name: "list",
      description: "List commissions, optionally filtered by state and worker.",
      operationId: "commission.request.commission.list",
      args: [],
      flags: [
        { name: "state", type: "string", description: "Filter by commission state." },
        { name: "worker", type: "string", description: "Filter by worker name." },
      ],
      example: "guild-hall commission list --state=requested",
      outputShape: "{ commissions: Array<{ id, projectName, worker, state, ... }> }",
    }),
    leaf({
      kind: "leaf",
      name: "read",
      description: "Read a commission by id within a project.",
      operationId: "commission.request.commission.read",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "commissionId", required: true, type: "string", description: "Commission identifier." },
      ],
      example: "guild-hall commission read my-project commission-Dalton-20260420-215633",
      outputShape: "{ commission: { id, status, prompt, ... } }",
    }),
    leaf({
      kind: "leaf",
      name: "create",
      description: "Create a new commission for a worker on a project.",
      operationId: "commission.request.commission.create",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "worker", required: true, type: "string", description: "Worker (package) to dispatch to." },
        { name: "title", required: true, type: "string", description: "Short commission title." },
        { name: "prompt", required: true, type: "string", description: "Full commission brief." },
      ],
      example: "guild-hall commission create my-project Dalton 'Build X' 'Detailed brief...'",
      outputShape: "{ commission: { id, status: 'requested', ... } }",
    }),
    leaf({
      kind: "leaf",
      name: "dispatch",
      description: "Dispatch a requested commission to its worker.",
      operationId: "commission.run.dispatch",
      args: [{ name: "commissionId", required: true, type: "string", description: "Commission identifier." }],
      example: "guild-hall commission dispatch commission-Dalton-20260420-215633",
      outputShape: "{ commission: { id, status: 'running', ... } }",
    }),
    leaf({
      kind: "leaf",
      name: "redispatch",
      description: "Redispatch a previously cancelled or failed commission.",
      operationId: "commission.run.redispatch",
      args: [{ name: "commissionId", required: true, type: "string", description: "Commission identifier." }],
      example: "guild-hall commission redispatch commission-Dalton-20260420-215633",
      outputShape: "{ commission: { id, status, ... } }",
    }),
    leaf({
      kind: "leaf",
      name: "cancel",
      description: "Cancel a running commission.",
      operationId: "commission.run.cancel",
      args: [{ name: "commissionId", required: true, type: "string", description: "Commission identifier." }],
      example: "guild-hall commission cancel commission-Dalton-20260420-215633",
      outputShape: "{ commission: { id, status: 'cancelled' } }",
    }),
    leaf({
      kind: "leaf",
      name: "abandon",
      description: "Abandon a commission with a written reason.",
      operationId: "commission.run.abandon",
      args: [
        { name: "commissionId", required: true, type: "string", description: "Commission identifier." },
        { name: "reason", required: true, type: "string", description: "Reason for abandonment." },
      ],
      example: "guild-hall commission abandon commission-Dalton-20260420-215633 'Scope changed'",
      outputShape: "{ commission: { id, status: 'abandoned', reason } }",
    }),
    leaf({
      kind: "leaf",
      name: "note",
      description: "Append a note to a commission.",
      operationId: "commission.request.commission.note",
      args: [
        { name: "commissionId", required: true, type: "string", description: "Commission identifier." },
        { name: "content", required: true, type: "string", description: "Note body." },
      ],
      example: "guild-hall commission note commission-Dalton-20260420-215633 'Picked up extra context'",
      outputShape: "{ note: { id, content, addedAt } }",
    }),
    leaf({
      kind: "leaf",
      name: "update",
      description: "Update a commission's mutable fields.",
      operationId: "commission.request.commission.update",
      args: [{ name: "commissionId", required: true, type: "string", description: "Commission identifier." }],
      example: "guild-hall commission update commission-Dalton-20260420-215633",
      outputShape: "{ commission: { id, ... } }",
    }),
    group({
      kind: "group",
      name: "deps",
      description: "Inspect commission dependencies.",
      children: [
        leaf({
          kind: "leaf",
          name: "check",
          description: "Check unmet dependencies for a project's commissions.",
          operationId: "commission.dependency.project.check",
          args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
          example: "guild-hall commission deps check my-project",
          outputShape: "{ unmet: Array<{ commissionId, dependsOn }> }",
        }),
        leaf({
          kind: "leaf",
          name: "graph",
          description: "Render the dependency graph for a project's commissions.",
          operationId: "commission.dependency.project.graph",
          args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
          example: "guild-hall commission deps graph my-project",
          outputShape: "{ nodes: [...], edges: [...] }",
        }),
      ],
    }),
  ],
});

const meetingGroup = group({
  kind: "group",
  name: "meeting",
  description: "Request, conduct, and inspect worker meetings.",
  children: [
    leaf({
      kind: "leaf",
      name: "list",
      description:
        "List meeting requests and active sessions, filtered by state.",
      operationId: AGGREGATE_SENTINEL,
      aggregate: {
        operationIds: [
          "meeting.request.meeting.list",
          "meeting.session.meeting.list",
        ],
        justification:
          "Requested meetings (file-based) and active sessions (in-memory) live in different daemon ops; the agent surface presents a single 'meeting list' view (REQ-CLI-AGENT-10a).",
      },
      args: [],
      flags: [
        {
          name: "state",
          type: "string",
          default: "all",
          description: "Filter: requested | active | all.",
        },
        {
          name: "projectName",
          type: "string",
          description:
            "Scope requested-meeting lookup to a single project. Omit to fan out across all registered projects.",
        },
      ],
      example: "guild-hall meeting list --state=active",
      outputShape: "{ meetings: Array<{ meetingId, projectName, worker, status, ... }> }",
    }),
    leaf({
      kind: "leaf",
      name: "read",
      description: "Read a meeting (request or session) by id.",
      operationId: "meeting.request.meeting.read",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "meetingId", required: true, type: "string", description: "Meeting identifier." },
      ],
      example: "guild-hall meeting read my-project audience-Octavia-20260420-205144",
      outputShape: "{ meeting: { meetingId, status, notes, transcript? } }",
    }),
    leaf({
      kind: "leaf",
      name: "create",
      description: "Create a meeting request for a worker.",
      operationId: "meeting.request.meeting.create",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "worker", required: true, type: "string", description: "Worker name." },
        { name: "agenda", required: true, type: "string", description: "Meeting agenda." },
      ],
      example: "guild-hall meeting create my-project Octavia 'Review the spec'",
      outputShape: "{ meeting: { meetingId, status: 'requested' } }",
    }),
    leaf({
      kind: "leaf",
      name: "accept",
      description: "Accept a pending meeting request.",
      operationId: "meeting.request.meeting.accept",
      args: [{ name: "meetingId", required: true, type: "string", description: "Meeting identifier." }],
      example: "guild-hall meeting accept audience-Octavia-20260420-205144",
      outputShape: "{ meeting: { meetingId, status: 'open' } }",
    }),
    leaf({
      kind: "leaf",
      name: "decline",
      description: "Decline a pending meeting request.",
      operationId: "meeting.request.meeting.decline",
      args: [{ name: "meetingId", required: true, type: "string", description: "Meeting identifier." }],
      example: "guild-hall meeting decline audience-Octavia-20260420-205144",
      outputShape: "{ meeting: { meetingId, status: 'declined' } }",
    }),
    leaf({
      kind: "leaf",
      name: "defer",
      description: "Defer a meeting request to a later time.",
      operationId: "meeting.request.meeting.defer",
      args: [{ name: "meetingId", required: true, type: "string", description: "Meeting identifier." }],
      example: "guild-hall meeting defer audience-Octavia-20260420-205144",
      outputShape: "{ meeting: { meetingId, status: 'deferred' } }",
    }),
    leaf({
      kind: "leaf",
      name: "message",
      description: "Send a message to an active meeting session.",
      operationId: "meeting.session.message.send",
      args: [
        { name: "meetingId", required: true, type: "string", description: "Meeting identifier." },
        { name: "content", required: true, type: "string", description: "Message body." },
      ],
      example: "guild-hall meeting message audience-Octavia-20260420-205144 'Following up...'",
      outputShape: "SSE stream of meeting events.",
    }),
    leaf({
      kind: "leaf",
      name: "interrupt",
      description: "Interrupt the worker's current generation in a meeting.",
      operationId: "meeting.session.generation.interrupt",
      args: [{ name: "meetingId", required: true, type: "string", description: "Meeting identifier." }],
      example: "guild-hall meeting interrupt audience-Octavia-20260420-205144",
      outputShape: "{ interrupted: true }",
    }),
    leaf({
      kind: "leaf",
      name: "close",
      description: "Close an active meeting session and persist notes.",
      operationId: "meeting.session.meeting.close",
      args: [{ name: "meetingId", required: true, type: "string", description: "Meeting identifier." }],
      example: "guild-hall meeting close audience-Octavia-20260420-205144",
      outputShape: "{ notes: string }",
    }),
  ],
});

const issueGroup = group({
  kind: "group",
  name: "issue",
  description: "List, read, and create workspace issues.",
  children: [
    leaf({
      kind: "leaf",
      name: "list",
      description: "List issues for a project, optionally filtered by status.",
      operationId: "workspace.issue.list",
      args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
      flags: [{ name: "status", type: "string", description: "Filter by issue status." }],
      example: "guild-hall issue list my-project --status=open",
      outputShape: "{ issues: Array<{ slug, title, status, date }> }",
    }),
    leaf({
      kind: "leaf",
      name: "read",
      description: "Read a single issue by slug.",
      operationId: "workspace.issue.read",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "slug", required: true, type: "string", description: "Issue slug (filename without .md)." },
      ],
      example: "guild-hall issue read my-project add-cli-command-to-list-active-meetings",
      outputShape: "{ slug, title, status, date, body }",
    }),
    leaf({
      kind: "leaf",
      name: "create",
      description: "Create a new issue under .lore/issues/.",
      operationId: "workspace.issue.create",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "title", required: true, type: "string", description: "Issue title." },
        { name: "body", required: true, type: "string", description: "Issue body markdown." },
      ],
      example: "guild-hall issue create my-project 'CLI typo' 'Fix the help output...'",
      outputShape: "{ issue: { slug, title } }",
    }),
  ],
});

const artifactGroup = group({
  kind: "group",
  name: "artifact",
  description: "Read and persist project artifacts (documents, images, mockups).",
  children: [
    leaf({
      kind: "leaf",
      name: "list",
      description: "List documents under a project's .lore/ tree.",
      operationId: "workspace.artifact.document.list",
      args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
      example: "guild-hall artifact list my-project",
      outputShape: "{ artifacts: Array<{ path, title?, ... }> }",
    }),
    leaf({
      kind: "leaf",
      name: "read",
      description: "Read a single document artifact.",
      operationId: "workspace.artifact.document.read",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "path", required: true, type: "string", description: "Relative artifact path." },
      ],
      example: "guild-hall artifact read my-project specs/foo.md",
      outputShape: "{ artifact: { path, frontmatter, body } }",
    }),
    leaf({
      kind: "leaf",
      name: "save",
      description: "Persist new content to a document artifact.",
      operationId: ARTIFACT_DOCUMENT_WRITE_OP,
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
        { name: "path", required: true, type: "string", description: "Relative artifact path." },
        { name: "body", required: true, type: "string", description: "Markdown body to persist." },
      ],
      example: "guild-hall artifact save my-project specs/foo.md '...'",
      outputShape: "{ artifact: { path } }",
    }),
    group({
      kind: "group",
      name: "image",
      description: "Read image artifacts.",
      children: [
        leaf({
          kind: "leaf",
          name: "meta",
          description: "Read image metadata (dimensions, format).",
          operationId: "workspace.artifact.image.meta",
          args: [
            { name: "projectName", required: true, type: "string", description: "Project name." },
            { name: "path", required: true, type: "string", description: "Image path." },
          ],
          example: "guild-hall artifact image meta my-project images/cover.png",
          outputShape: "{ width, height, format, ... }",
        }),
        leaf({
          kind: "leaf",
          name: "read",
          description: "Read an image artifact's binary content.",
          operationId: "workspace.artifact.image.read",
          args: [
            { name: "projectName", required: true, type: "string", description: "Project name." },
            { name: "path", required: true, type: "string", description: "Image path." },
          ],
          example: "guild-hall artifact image read my-project images/cover.png",
          outputShape: "Image bytes (binary).",
        }),
      ],
    }),
    group({
      kind: "group",
      name: "mockup",
      description: "Read mockup artifacts.",
      children: [
        leaf({
          kind: "leaf",
          name: "read",
          description: "Read a mockup artifact.",
          operationId: "workspace.artifact.mockup.read",
          args: [
            { name: "projectName", required: true, type: "string", description: "Project name." },
            { name: "path", required: true, type: "string", description: "Mockup path." },
          ],
          example: "guild-hall artifact mockup read my-project mockups/dashboard.json",
          outputShape: "{ mockup: { path, content } }",
        }),
      ],
    }),
  ],
});

const briefingGroup = group({
  kind: "group",
  name: "briefing",
  description: "Read coordination review briefings.",
  children: [
    leaf({
      kind: "leaf",
      name: "read",
      description: "Read the latest briefing for a project.",
      operationId: "coordination.review.briefing.read",
      args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
      example: "guild-hall briefing read my-project",
      outputShape: "{ briefing: { generatedAt, content } }",
    }),
  ],
});

const workerGroup = group({
  kind: "group",
  name: "worker",
  description: "Inspect installed worker packages.",
  children: [
    leaf({
      kind: "leaf",
      name: "list",
      description: "List all available worker packages.",
      operationId: "system.packages.worker.list",
      args: [],
      example: "guild-hall worker list",
      outputShape: "{ workers: Array<{ name, version, displayTitle }> }",
    }),
  ],
});

const modelGroup = group({
  kind: "group",
  name: "model",
  description: "Inspect available LLM models.",
  children: [
    leaf({
      kind: "leaf",
      name: "list",
      description: "List available models in the catalog.",
      operationId: "system.models.catalog.list",
      args: [],
      example: "guild-hall model list",
      outputShape: "{ models: Array<{ id, displayName, ... }> }",
    }),
  ],
});

const eventGroup = group({
  kind: "group",
  name: "event",
  description: "Subscribe to the daemon event stream.",
  children: [
    leaf({
      kind: "leaf",
      name: "subscribe",
      description: "Subscribe to the SSE event stream.",
      operationId: "system.events.stream.subscribe",
      args: [],
      example: "guild-hall event subscribe",
      outputShape: "SSE stream of GuildHallEvent values.",
    }),
  ],
});

const configGroup = group({
  kind: "group",
  name: "config",
  description: "Read, validate, and reload application configuration.",
  children: [
    leaf({
      kind: "leaf",
      name: "read",
      description: "Read the current application configuration.",
      operationId: "system.config.application.read",
      args: [],
      example: "guild-hall config read",
      outputShape: "{ config: AppConfig }",
    }),
    leaf({
      kind: "leaf",
      name: "validate",
      description: "Validate the current configuration file.",
      operationId: "system.config.application.validate",
      args: [],
      example: "guild-hall config validate",
      outputShape: "{ valid: boolean, errors?: [...] }",
    }),
    leaf({
      kind: "leaf",
      name: "reload",
      description: "Reload application configuration from disk.",
      operationId: "system.config.application.reload",
      args: [],
      example: "guild-hall config reload",
      outputShape: "{ reloaded: true }",
    }),
  ],
});

const gitGroup = group({
  kind: "group",
  name: "git",
  description: "Project git integration: branch sync, lore commits.",
  children: [
    leaf({
      kind: "leaf",
      name: "rebase",
      description: "Rebase the project's claude branch onto master.",
      operationId: "workspace.git.branch.rebase",
      args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
      example: "guild-hall git rebase my-project",
      outputShape: "{ rebased: true, conflicts?: [...] }",
    }),
    leaf({
      kind: "leaf",
      name: "sync",
      description: "Post-merge sync of integration worktree state.",
      operationId: "workspace.git.integration.sync",
      args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
      example: "guild-hall git sync my-project",
      outputShape: "{ synced: true }",
    }),
    group({
      kind: "group",
      name: "lore",
      description: "Commit and inspect lore files.",
      children: [
        leaf({
          kind: "leaf",
          name: "commit",
          description: "Commit pending .lore/ changes with a message.",
          operationId: "workspace.git.lore.commit",
          args: [
            { name: "projectName", required: true, type: "string", description: "Project name." },
            { name: "message", required: true, type: "string", description: "Commit message." },
          ],
          example: "guild-hall git lore commit my-project 'Add spec for X'",
          outputShape: "{ commitSha: string }",
        }),
        leaf({
          kind: "leaf",
          name: "status",
          description: "Show lore-tree status for a project.",
          operationId: "workspace.git.lore.status",
          args: [{ name: "projectName", required: true, type: "string", description: "Project name." }],
          example: "guild-hall git lore status my-project",
          outputShape: "{ modified: [...], untracked: [...] }",
        }),
      ],
    }),
  ],
});

const systemGroup = group({
  kind: "group",
  name: "system",
  description: "System-wide daemon operations.",
  children: [
    leaf({
      kind: "leaf",
      name: "health",
      description: "Read daemon runtime health.",
      operationId: "system.runtime.daemon.health",
      args: [],
      example: "guild-hall system health",
      outputShape: "{ uptimeSeconds, meetingCount, ... }",
    }),
  ],
});

const migrateContentLeaf = leaf({
  kind: "leaf",
  name: "migrate-content",
  description: "Migrate result_summary from frontmatter to body (local-only).",
  operationId: LOCAL_COMMAND_SENTINEL,
  args: [],
  flags: [
    {
      name: "apply",
      type: "boolean",
      description: "Apply the migration (without this flag the run is a dry-run).",
    },
  ],
  example: "guild-hall migrate-content --apply",
  outputShape:
    "Human-readable summary of scanned commission files and changes applied. Exits non-zero on failure.",
});

const packageOpGroup = group({
  kind: "group",
  name: "package-op",
  description:
    "Transitional fallback for package-contributed operations not yet mapped into the noun-centric surface. Pass the daemon `operationId` as the first argument; remaining arguments forward to the daemon call.",
  children: [
    leaf({
      kind: "leaf",
      name: "invoke",
      description:
        "Forward to any registered daemon operation by id. The first positional argument is the target operationId.",
      operationId: PACKAGE_OP_SENTINEL,
      args: [
        {
          name: "operationId",
          required: true,
          type: "string",
          description: "Target daemon operationId to invoke.",
        },
      ],
      example: "guild-hall package-op invoke commission.request.commission.list",
      outputShape: "Whatever the target operation returns.",
    }),
  ],
});

export const CLI_SURFACE: CliGroupNode = {
  kind: "group",
  name: "guild-hall",
  description:
    "Guild Hall CLI — agent-first surface over the daemon. Each leaf maps to a single daemon operation; aggregation and package-op fallbacks are explicit.",
  children: [
    projectGroup,
    commissionGroup,
    meetingGroup,
    issueGroup,
    artifactGroup,
    briefingGroup,
    workerGroup,
    modelGroup,
    eventGroup,
    configGroup,
    gitGroup,
    systemGroup,
    migrateContentLeaf,
    packageOpGroup,
  ],
};
