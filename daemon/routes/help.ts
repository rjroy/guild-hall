import { Hono } from "hono";

/**
 * Help tree node kinds. Each level of the /:root/:feature/:object/:operation
 * hierarchy has a fixed kind.
 */
type HelpKind = "root" | "feature" | "object" | "operation";

interface HelpNode {
  name: string;
  kind: HelpKind;
  description: string;
  /** HTTP method for operations. */
  method?: string;
  /** Full route path for operations. */
  path?: string;
  children?: HelpNode[];
}

/**
 * Builds the skillId from the path segments leading to this node.
 * Example: ["workspace", "artifact", "document"] -> "workspace.artifact.document"
 */
function buildSkillId(segments: string[]): string {
  return segments.join(".");
}

/**
 * Builds the URL path from segments.
 * Example: ["workspace", "artifact", "document"] -> "/workspace/artifact/document"
 */
function buildPath(segments: string[]): string {
  return "/" + segments.join("/");
}

/**
 * Serializes a help node into the response shape.
 */
function serializeNode(
  node: HelpNode,
  segments: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    skillId: buildSkillId(segments),
    version: "1",
    path: node.path ?? buildPath(segments),
    kind: node.kind,
    name: node.name,
    description: node.description,
    visibility: "available",
  };

  if (node.method) {
    result.method = node.method;
  }

  if (node.children) {
    result.children = node.children.map((child) => ({
      name: child.name,
      kind: child.kind,
      path: buildPath([...segments, child.name]),
      description: child.description,
    }));
  }

  return result;
}

// -- Help tree definition --

const HELP_TREE: HelpNode[] = [
  {
    name: "system",
    kind: "root",
    description: "System administration, configuration, and runtime management",
    children: [
      {
        name: "runtime",
        kind: "feature",
        description: "Daemon runtime status and control",
        children: [
          {
            name: "daemon",
            kind: "object",
            description: "Daemon process health and lifecycle",
            children: [
              {
                name: "health",
                kind: "operation",
                description: "Check daemon health status",
                method: "GET",
                path: "/system/runtime/daemon/health",
              },
            ],
          },
        ],
      },
      {
        name: "models",
        kind: "feature",
        description: "AI model catalog and configuration",
        children: [
          {
            name: "catalog",
            kind: "object",
            description: "Available AI models",
            children: [
              {
                name: "list",
                kind: "operation",
                description: "List available AI models",
                method: "GET",
                path: "/system/models/catalog/list",
              },
            ],
          },
        ],
      },
      {
        name: "packages",
        kind: "feature",
        description: "Worker and toolbox package management",
        children: [
          {
            name: "worker",
            kind: "object",
            description: "Worker packages",
            children: [
              {
                name: "list",
                kind: "operation",
                description: "List discovered worker packages",
                method: "GET",
                path: "/system/packages/worker/list",
              },
            ],
          },
        ],
      },
      {
        name: "config",
        kind: "feature",
        description: "Application and project configuration",
        children: [
          {
            name: "application",
            kind: "object",
            description: "Application-level configuration",
            children: [
              {
                name: "read",
                kind: "operation",
                description: "Read application configuration",
                method: "GET",
                path: "/system/config/application/read",
              },
              {
                name: "reload",
                kind: "operation",
                description: "Reload configuration from disk",
                method: "POST",
                path: "/system/config/application/reload",
              },
              {
                name: "validate",
                kind: "operation",
                description: "Validate configuration and project paths",
                method: "GET",
                path: "/system/config/application/validate",
              },
            ],
          },
          {
            name: "project",
            kind: "object",
            description: "Project-specific configuration",
            children: [
              {
                name: "read",
                kind: "operation",
                description: "Read single project configuration",
                method: "GET",
                path: "/system/config/project/read",
              },
              {
                name: "register",
                kind: "operation",
                description: "Register a new project",
                method: "POST",
                path: "/system/config/project/register",
              },
            ],
          },
        ],
      },
      {
        name: "events",
        kind: "feature",
        description: "Real-time event streaming",
        children: [
          {
            name: "stream",
            kind: "object",
            description: "Event stream connections",
            children: [
              {
                name: "subscribe",
                kind: "operation",
                description: "Subscribe to system event stream (SSE)",
                method: "GET",
                path: "/system/events/stream/subscribe",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "workspace",
    kind: "root",
    description: "Artifact management and git operations",
    children: [
      {
        name: "artifact",
        kind: "feature",
        description: "Project artifact document management",
        children: [
          {
            name: "document",
            kind: "object",
            description: "Artifact documents",
            children: [
              {
                name: "list",
                kind: "operation",
                description: "List artifacts for a project",
                method: "GET",
                path: "/workspace/artifact/document/list",
              },
              {
                name: "read",
                kind: "operation",
                description: "Read a single artifact",
                method: "GET",
                path: "/workspace/artifact/document/read",
              },
              {
                name: "write",
                kind: "operation",
                description: "Write artifact content",
                method: "POST",
                path: "/workspace/artifact/document/write",
              },
            ],
          },
        ],
      },
      {
        name: "git",
        kind: "feature",
        description: "Git branch and integration operations",
        children: [
          {
            name: "branch",
            kind: "object",
            description: "Branch management",
            children: [
              {
                name: "rebase",
                kind: "operation",
                description: "Rebase claude branch onto default branch",
                method: "POST",
                path: "/workspace/git/branch/rebase",
              },
            ],
          },
          {
            name: "integration",
            kind: "object",
            description: "Integration worktree sync",
            children: [
              {
                name: "sync",
                kind: "operation",
                description: "Smart sync: fetch, detect merged PRs, rebase",
                method: "POST",
                path: "/workspace/git/integration/sync",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "meeting",
    kind: "root",
    description: "Meeting requests, sessions, and message streaming",
    children: [
      {
        name: "request",
        kind: "feature",
        description: "Meeting request lifecycle",
        children: [
          {
            name: "meeting",
            kind: "object",
            description: "Meeting requests",
            children: [
              {
                name: "create",
                kind: "operation",
                description: "Create a new meeting and stream first turn",
                method: "POST",
                path: "/meeting/request/meeting/create",
              },
              {
                name: "accept",
                kind: "operation",
                description: "Accept a meeting request and stream first turn",
                method: "POST",
                path: "/meeting/request/meeting/accept",
              },
              {
                name: "decline",
                kind: "operation",
                description: "Decline a meeting request",
                method: "POST",
                path: "/meeting/request/meeting/decline",
              },
              {
                name: "defer",
                kind: "operation",
                description: "Defer a meeting request",
                method: "POST",
                path: "/meeting/request/meeting/defer",
              },
              {
                name: "list",
                kind: "operation",
                description: "List meeting requests for a project",
                method: "GET",
                path: "/meeting/request/meeting/list",
              },
              {
                name: "read",
                kind: "operation",
                description: "Read meeting detail",
                method: "GET",
                path: "/meeting/request/meeting/read",
              },
            ],
          },
        ],
      },
      {
        name: "session",
        kind: "feature",
        description: "Active meeting session operations",
        children: [
          {
            name: "message",
            kind: "object",
            description: "Message exchange within a meeting",
            children: [
              {
                name: "send",
                kind: "operation",
                description: "Send a message and stream response",
                method: "POST",
                path: "/meeting/session/message/send",
              },
            ],
          },
          {
            name: "generation",
            kind: "object",
            description: "AI generation control",
            children: [
              {
                name: "interrupt",
                kind: "operation",
                description: "Stop current generation",
                method: "POST",
                path: "/meeting/session/generation/interrupt",
              },
            ],
          },
          {
            name: "meeting",
            kind: "object",
            description: "Meeting session lifecycle",
            children: [
              {
                name: "close",
                kind: "operation",
                description: "Close an active meeting",
                method: "POST",
                path: "/meeting/session/meeting/close",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "commission",
    kind: "root",
    description: "Commission requests, execution, scheduling, and dependencies",
    children: [
      {
        name: "request",
        kind: "feature",
        description: "Commission request lifecycle",
        children: [
          {
            name: "commission",
            kind: "object",
            description: "Commission requests",
            children: [
              {
                name: "create",
                kind: "operation",
                description: "Create a new commission",
                method: "POST",
                path: "/commission/request/commission/create",
              },
              {
                name: "update",
                kind: "operation",
                description: "Update a pending commission",
                method: "POST",
                path: "/commission/request/commission/update",
              },
              {
                name: "note",
                kind: "operation",
                description: "Add a user note to a commission",
                method: "POST",
                path: "/commission/request/commission/note",
              },
              {
                name: "list",
                kind: "operation",
                description: "List commissions for a project",
                method: "GET",
                path: "/commission/request/commission/list",
              },
              {
                name: "read",
                kind: "operation",
                description: "Read commission detail",
                method: "GET",
                path: "/commission/request/commission/read",
              },
            ],
          },
        ],
      },
      {
        name: "run",
        kind: "feature",
        description: "Commission execution control",
        children: [
          {
            name: "dispatch",
            kind: "operation",
            description: "Dispatch a commission to a worker",
            method: "POST",
            path: "/commission/run/dispatch",
          },
          {
            name: "redispatch",
            kind: "operation",
            description: "Re-dispatch a failed or cancelled commission",
            method: "POST",
            path: "/commission/run/redispatch",
          },
          {
            name: "cancel",
            kind: "operation",
            description: "Cancel a pending commission",
            method: "POST",
            path: "/commission/run/cancel",
          },
          {
            name: "abandon",
            kind: "operation",
            description: "Abandon a running commission",
            method: "POST",
            path: "/commission/run/abandon",
          },
        ],
      },
      {
        name: "schedule",
        kind: "feature",
        description: "Scheduled commission management",
        children: [
          {
            name: "commission",
            kind: "object",
            description: "Scheduled commission lifecycle",
            children: [
              {
                name: "update",
                kind: "operation",
                description: "Update schedule status (pause/resume/complete)",
                method: "POST",
                path: "/commission/schedule/commission/update",
              },
            ],
          },
        ],
      },
      {
        name: "dependency",
        kind: "feature",
        description: "Commission dependency management",
        children: [
          {
            name: "project",
            kind: "object",
            description: "Project-level dependency operations",
            children: [
              {
                name: "check",
                kind: "operation",
                description: "Trigger dependency auto-transitions",
                method: "POST",
                path: "/commission/dependency/project/check",
              },
              {
                name: "graph",
                kind: "operation",
                description: "Get commission dependency graph",
                method: "GET",
                path: "/commission/dependency/project/graph",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "coordination",
    kind: "root",
    description: "Cross-cutting coordination and review",
    children: [
      {
        name: "review",
        kind: "feature",
        description: "Project review and status",
        children: [
          {
            name: "briefing",
            kind: "object",
            description: "Project status briefings",
            children: [
              {
                name: "read",
                kind: "operation",
                description: "Generate project status briefing",
                method: "GET",
                path: "/coordination/review/briefing/read",
              },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Walks the help tree to find the node at the given path segments.
 * Returns the matching node and the full segments path to it, or null if not found.
 */
function findNode(
  segments: string[],
): { node: HelpNode; segments: string[] } | null {
  if (segments.length === 0) return null;

  let nodes: HelpNode[] = HELP_TREE;
  let current: HelpNode | undefined;
  const walked: string[] = [];

  for (const segment of segments) {
    current = nodes.find((n) => n.name === segment);
    if (!current) return null;
    walked.push(segment);
    nodes = current.children ?? [];
  }

  return current ? { node: current, segments: walked } : null;
}

/**
 * Creates help routes that serve metadata at all hierarchy levels.
 *
 * GET /help                                     - List top-level roots
 * GET /:root/help                               - List features
 * GET /:root/:feature/help                      - List objects
 * GET /:root/:feature/:object/help              - List operations
 * GET /:root/:feature/:object/:operation/help   - Full operation metadata
 */
export function createHelpRoutes(): Hono {
  const routes = new Hono();

  // GET /help - List top-level roots
  routes.get("/help", (c) => {
    return c.json({
      skillId: "",
      version: "1",
      path: "/",
      kind: "root",
      name: "Guild Hall API",
      description: "Guild Hall daemon REST API",
      visibility: "available",
      children: HELP_TREE.map((root) => ({
        name: root.name,
        kind: root.kind,
        path: `/${root.name}`,
        description: root.description,
      })),
    });
  });

  // GET /:root/help
  routes.get("/:root/help", (c) => {
    const result = findNode([c.req.param("root")]);
    if (!result) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(serializeNode(result.node, result.segments));
  });

  // GET /:root/:feature/help
  routes.get("/:root/:feature/help", (c) => {
    const result = findNode([c.req.param("root"), c.req.param("feature")]);
    if (!result) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(serializeNode(result.node, result.segments));
  });

  // GET /:root/:feature/:object/help
  routes.get("/:root/:feature/:object/help", (c) => {
    const result = findNode([
      c.req.param("root"),
      c.req.param("feature"),
      c.req.param("object"),
    ]);
    if (!result) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(serializeNode(result.node, result.segments));
  });

  // GET /:root/:feature/:object/:operation/help
  routes.get("/:root/:feature/:object/:operation/help", (c) => {
    const result = findNode([
      c.req.param("root"),
      c.req.param("feature"),
      c.req.param("object"),
      c.req.param("operation"),
    ]);
    if (!result) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(serializeNode(result.node, result.segments));
  });

  return routes;
}
