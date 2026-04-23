/**
 * Structural test suite for the CLI agent-first surface (Phase 5, REQ-CLI-AGENT-*).
 *
 * Consolidates the AI Validation set from `.lore/specs/infrastructure/cli-agent-surface.md`:
 * - Path-rule tests
 * - Help-completeness (every leaf's help --json has all required fields)
 * - CLI mapping ↔ operation catalog consistency (in-process via createApp)
 * - Daemon leaf presence for the four Phase 1 ops (app.request())
 * - Daemon /help 404 guard (REQ-CLI-AGENT-26)
 * - No-cliPath compile-time + runtime assertions
 * - Formatter-keying test
 * - Package-op coverage (every registered op is claimed or reachable via package-op)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import { noopEventBus } from "@/daemon/lib/event-bus";
import type { GitOps } from "@/daemon/lib/git";
import type { HeartbeatService } from "@/daemon/services/heartbeat/index";
import type { createBriefingGenerator } from "@/daemon/services/briefing-generator";
import type { MeetingSessionForRoutes } from "@/daemon/services/meeting/orchestrator";
import type { ActiveMeetingEntry } from "@/daemon/services/meeting/registry";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type {
  AppConfig,
  DiscoveredPackage,
  OperationDefinition,
} from "@/lib/types";
import type { OperationsRegistry } from "@/daemon/lib/operations-registry";
import {
  CLI_SURFACE,
  AGGREGATE_SENTINEL,
  LOCAL_COMMAND_SENTINEL,
  PACKAGE_OP_SENTINEL,
  type CliNode,
} from "@/apps/cli/surface";
import {
  assertPathRules,
  invocationForOperation,
  leafNodes,
  operationIdsFor,
  pathForNode,
} from "@/apps/cli/surface-utils";
import { runCli, type CliDeps } from "@/apps/cli/index";
import {
  getCommissionFormatter,
  isCommissionAction,
} from "@/apps/cli/commission-format";

// --- Compile-time guard: OperationDefinition has no `cliPath` key ---
// Phase 2 removed cliPath from the OperationDefinition surface. If anyone
// reintroduces the field, `_NoCliPath` evaluates to `never` and the assignment
// below fails to type-check.
type _NoCliPath = "cliPath" extends keyof OperationDefinition ? never : true;
const _noCliPathCheck: _NoCliPath = true;
void _noCliPathCheck;

// --- Test fixtures: full-deps application factory ---

function makeMockGitOps(): GitOps {
  return {
    createBranch: () => Promise.resolve(),
    branchExists: () => Promise.resolve(false),
    deleteBranch: () => Promise.resolve(),
    hasCommitsBeyond: () => Promise.resolve(false),
    createWorktree: () => Promise.resolve(),
    removeWorktree: () => Promise.resolve(),
    configureSparseCheckout: () => Promise.resolve(),
    commitAll: () => Promise.resolve(false),
    squashMerge: () => Promise.resolve(),
    hasUncommittedChanges: () => Promise.resolve(false),
    rebase: () => Promise.resolve(),
    currentBranch: () => Promise.resolve("main"),
    listWorktrees: () => Promise.resolve([]),
    initClaudeBranch: () => Promise.resolve(),
    detectDefaultBranch: () => Promise.resolve("main"),
    fetch: () => Promise.resolve(),
    push: () => Promise.resolve(),
    resetHard: () => Promise.resolve(),
    resetSoft: () => Promise.resolve(),
    createPullRequest: () => Promise.resolve({ url: "" }),
    isAncestor: () => Promise.resolve(false),
    treesEqual: () => Promise.resolve(false),
    revParse: () => Promise.resolve(""),
    rebaseOnto: () => Promise.resolve(),
    merge: () => Promise.resolve(),
    squashMergeNoCommit: () => Promise.resolve(true),
    listConflictedFiles: () => Promise.resolve([]),
    resolveConflictsTheirs: () => Promise.resolve(),
    mergeAbort: () => Promise.resolve(),
    lorePendingChanges: () =>
      Promise.resolve({ hasPendingChanges: false, fileCount: 0 }),
    commitLore: () => Promise.resolve({ committed: false }),
  } as GitOps;
}

function makeStubMeetingSession(): MeetingSessionForRoutes {
  const notImpl = (name: string) => {
    throw new Error(`MeetingSession stub: ${name} not implemented for structural tests`);
  };
  async function* empty(): AsyncGenerator<never> {
    // no events
  }
  return {
    acceptMeetingRequest: () => empty(),
    createMeeting: () => empty(),
    createMeetingRequest: () => Promise.resolve(),
    sendMessage: () => empty(),
    closeMeeting: () => Promise.resolve({ notes: "" }),
    recoverMeetings: () => Promise.resolve(0),
    declineMeeting: () => Promise.resolve(),
    deferMeeting: () => Promise.resolve(),
    interruptTurn: () => undefined,
    getActiveMeetings: () => 0,
    getOpenMeetingsForProject: (): ActiveMeetingEntry[] => [],
    listAllActiveMeetings: (): ActiveMeetingEntry[] => [],
    // Expose notImpl so unused-var lint doesn't complain.
    _notImpl: notImpl,
  } as unknown as MeetingSessionForRoutes;
}

function makeStubCommissionSession(): CommissionSessionForRoutes {
  return {
    createCommission: () => Promise.resolve({ commissionId: "stub-id" }),
    updateCommission: () => Promise.resolve(),
    dispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
    cancelCommission: () => Promise.resolve(),
    abandonCommission: () => Promise.resolve(),
    redispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
    addUserNote: () => Promise.resolve(),
    checkDependencyTransitions: () => Promise.resolve(),
    recoverCommissions: () => Promise.resolve(0),
    getActiveCommissions: () => 0,
    shutdown: () => undefined,
  };
}

function makeStubBriefingGenerator(): ReturnType<typeof createBriefingGenerator> {
  const result = {
    briefing: "stub briefing",
    generatedAt: new Date().toISOString(),
    cached: false,
  };
  return {
    generateBriefing: () => Promise.resolve(result),
    generateAllProjectsBriefing: () => Promise.resolve(result),
    getCachedBriefing: () => Promise.resolve(null),
    invalidateCache: () => Promise.resolve(),
  } as unknown as ReturnType<typeof createBriefingGenerator>;
}

function makeStubHeartbeatService(): HeartbeatService {
  return {
    start: () => undefined,
    stop: () => undefined,
    tickProject: () => Promise.resolve({ success: true }),
    getLastTick: () => undefined,
  };
}

function makeTestConfig(): AppConfig {
  return {
    projects: [{ name: "stub-project", path: "/tmp/stub-project" }],
  };
}

function makeStubPackages(): DiscoveredPackage[] {
  return [];
}

interface FullAppHandle {
  app: ReturnType<typeof createApp>["app"];
  registry: OperationsRegistry;
  guildHallHome: string;
}

function makeFullApp(guildHallHome: string): FullAppHandle {
  const config = makeTestConfig();
  const gitOps = makeMockGitOps();
  const { app, registry } = createApp({
    health: {
      getMeetingCount: () => 0,
      getCommissionCount: () => 0,
      getUptimeSeconds: () => 0,
    },
    meetingSession: makeStubMeetingSession(),
    commissionSession: makeStubCommissionSession(),
    packages: makeStubPackages(),
    eventBus: noopEventBus,
    briefingGenerator: makeStubBriefingGenerator(),
    config,
    admin: {
      config,
      guildHallHome,
      gitOps,
      readConfigFromDisk: () => Promise.resolve(config),
    },
    artifacts: { config, guildHallHome, gitOps },
    gitLore: { config, guildHallHome, gitOps },
    workspaceIssue: { config, guildHallHome, gitOps },
    configRoutes: { config, guildHallHome },
    heartbeat: {
      heartbeatService: makeStubHeartbeatService(),
      config,
      guildHallHome,
    },
  });
  return { app, registry, guildHallHome };
}

let tmpDir: string;
let handle: FullAppHandle;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(
    path.join(process.env.TMPDIR ?? "/tmp", "surface-structural-"),
  );
  handle = makeFullApp(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// --- Help renderer via runCli (shared with skill-build test) ---

function throwingCliDeps(): CliDeps {
  return {
    daemonFetch: () => {
      throw new Error("help path must not reach the daemon");
    },
    streamOperation: () => {
      throw new Error("help path must not stream");
    },
  };
}

async function helpJson(pathSegments: string[]): Promise<Record<string, unknown>> {
  const argv =
    pathSegments.length === 0
      ? ["help", "--json"]
      : [...pathSegments, "help", "--json"];
  const logs: string[] = [];
  const originalLog = console.log.bind(console);
  console.log = (msg: string) => logs.push(msg);
  try {
    await runCli(argv, throwingCliDeps());
  } finally {
    console.log = originalLog;
  }
  return JSON.parse(logs.join("\n")) as Record<string, unknown>;
}

// --- Tests ---

describe("path-rule invariants (REQ-CLI-AGENT-8, 9, 11, 12, 21)", () => {
  test("assertPathRules returns zero violations", () => {
    const violations = assertPathRules(CLI_SURFACE);
    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - [${v.rule}] ${v.path.join("/")}: ${v.detail}`)
        .join("\n");
      throw new Error(
        `assertPathRules returned ${violations.length} violation(s):\n${detail}`,
      );
    }
  });

  test("every group has a non-empty description (help-completeness precondition)", () => {
    const walk = (node: CliNode) => {
      if (node.kind !== "group") return;
      expect(node.description.length).toBeGreaterThan(0);
      for (const child of node.children) walk(child);
    };
    for (const child of CLI_SURFACE.children) walk(child);
  });
});

describe("help-completeness: every leaf's help --json has required fields", () => {
  test("every leaf reachable via help has path, description, example, outputShape, args, flags", async () => {
    const problems: string[] = [];
    for (const leaf of leafNodes()) {
      const segments = pathForNode(leaf);
      if (!segments) continue;
      const json = await helpJson(segments);
      const fullPath = "/" + segments.join("/");
      if (json.kind !== "leaf") {
        problems.push(`${fullPath}: help kind is ${JSON.stringify(json.kind)}, expected "leaf"`);
        continue;
      }
      if (typeof json.path !== "string" || json.path.length === 0) {
        problems.push(`${fullPath}: missing path`);
      }
      if (typeof json.description !== "string" || json.description.length === 0) {
        problems.push(`${fullPath}: missing description`);
      }
      if (typeof json.example !== "string" || json.example.length === 0) {
        problems.push(`${fullPath}: missing example`);
      }
      if (typeof json.outputShape !== "string" || json.outputShape.length === 0) {
        problems.push(`${fullPath}: missing outputShape`);
      }
      if (!Array.isArray(json.args)) {
        problems.push(`${fullPath}: args is not an array`);
      }
      if (!Array.isArray(json.flags)) {
        problems.push(`${fullPath}: flags is not an array`);
      }
    }
    if (problems.length > 0) {
      throw new Error(`Help-completeness failures:\n  ${problems.join("\n  ")}`);
    }
  });
});

describe("CLI mapping ↔ operation catalog consistency (in-process)", () => {
  test("every non-sentinel operationId referenced by the surface is registered", () => {
    const missing: Array<{ path: string; operationId: string }> = [];
    for (const leaf of leafNodes()) {
      for (const opId of operationIdsFor(leaf)) {
        if (!handle.registry.get(opId)) {
          const segments = pathForNode(leaf) ?? [leaf.name];
          missing.push({
            path: "/" + segments.join("/"),
            operationId: opId,
          });
        }
      }
    }
    if (missing.length > 0) {
      const detail = missing
        .map((m) => `  - ${m.path}: ${m.operationId}`)
        .join("\n");
      throw new Error(`Surface references unregistered operationIds:\n${detail}`);
    }
    expect(missing).toEqual([]);
  });

  test("every aggregate leaf's operationIds are all registered", () => {
    const aggregates = leafNodes().filter(
      (l) => l.operationId === AGGREGATE_SENTINEL,
    );
    expect(aggregates.length).toBeGreaterThan(0);
    for (const agg of aggregates) {
      const ids = agg.aggregate?.operationIds ?? [];
      for (const opId of ids) {
        expect(handle.registry.get(opId)).toBeDefined();
      }
    }
  });

  test("no surface leaf references a daemon operation with `cliPath` metadata", () => {
    // Runtime sanity check paired with the compile-time `_NoCliPath` guard.
    // Iterates every registered op (not just those the surface references)
    // so a stray cliPath added to a package-contributed op is caught too.
    const offenders: string[] = [];
    for (const [opId, op] of handle.registry.operations) {
      if ("cliPath" in op) {
        offenders.push(opId);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Phase 1 daemon leaves return valid responses for typical inputs", () => {
  // These four operations are the Phase 1 additions referenced in the spec:
  // system.config.project.list, meeting.session.meeting.list,
  // workspace.issue.list, workspace.issue.read. The registry-consistency
  // test above covers registration. This block verifies the routes respond
  // for a typical invocation.

  test("GET /system/config/project/list returns the stubbed projects list", async () => {
    const res = await handle.app.request("/system/config/project/list");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: Array<{ name: string }> };
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.map((p) => p.name)).toContain("stub-project");
  });

  test("GET /meeting/session/meeting/list returns an empty sessions array", async () => {
    const res = await handle.app.request("/meeting/session/meeting/list");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  test("GET /workspace/issue/list returns an empty issues array when .lore/issues is absent", async () => {
    const res = await handle.app.request(
      "/workspace/issue/list?projectName=stub-project",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { issues: unknown[] };
    expect(body.issues).toEqual([]);
  });

  test("GET /workspace/issue/read returns 404 when the slug is not found", async () => {
    const res = await handle.app.request(
      "/workspace/issue/read?projectName=stub-project&slug=missing-slug",
    );
    expect(res.status).toBe(404);
  });
});

describe("daemon /help surface removal (REQ-CLI-AGENT-26)", () => {
  test("GET /help returns 404", async () => {
    const res = await handle.app.request("/help");
    expect(res.status).toBe(404);
  });

  test("GET /help/operations returns 404", async () => {
    const res = await handle.app.request("/help/operations");
    expect(res.status).toBe(404);
  });

  test("GET /commission/help returns 404 (representative tree-walk)", async () => {
    const res = await handle.app.request("/commission/help");
    expect(res.status).toBe(404);
  });

  test("GET /meeting/help returns 404", async () => {
    const res = await handle.app.request("/meeting/help");
    expect(res.status).toBe(404);
  });
});

describe("no-cliPath enforcement (REQ-CLI-AGENT-2)", () => {
  test("compile-time: 'cliPath' is not a key of OperationDefinition", () => {
    // This test body is mostly a statement of the compile-time guard declared
    // at file scope. If the module type-checks, _noCliPathCheck === true.
    expect(_noCliPathCheck).toBe(true);
  });

  test("runtime: no operation registered in the in-process registry has `cliPath`", () => {
    const offenders: string[] = [];
    for (const [opId, op] of handle.registry.operations) {
      if (Object.prototype.hasOwnProperty.call(op, "cliPath")) {
        offenders.push(opId);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("formatter keying (operationId, not path)", () => {
  test("commission list/read formatters are reachable by operationId", () => {
    expect(getCommissionFormatter("commission.request.commission.list")).toBeDefined();
    expect(getCommissionFormatter("commission.request.commission.read")).toBeDefined();
  });

  test("formatter lookup by CLI path returns undefined", () => {
    // Any string that isn't a registered operationId must not resolve.
    expect(getCommissionFormatter("commission/list")).toBeUndefined();
    expect(getCommissionFormatter("/commission/list")).toBeUndefined();
    expect(getCommissionFormatter("commission.list")).toBeUndefined();
  });

  test("commission action predicate keyed on operationId", () => {
    expect(isCommissionAction("commission.run.dispatch")).toBe(true);
    expect(isCommissionAction("commission.run.cancel")).toBe(true);
    expect(isCommissionAction("commission.run.abandon")).toBe(true);
    expect(isCommissionAction("commission.run.redispatch")).toBe(true);
    expect(isCommissionAction("commission.request.commission.list")).toBe(false);
    // CLI path lookups must not collide with operationId lookups.
    expect(isCommissionAction("commission/dispatch")).toBe(false);
    expect(isCommissionAction("dispatch")).toBe(false);
  });
});

describe("meeting list aggregate (reference inclusion from Phase 4)", () => {
  test("meeting/list is an aggregate leaf over two operationIds", () => {
    const leaves = leafNodes();
    const meetingList = leaves.find(
      (l) => pathForNode(l)?.join("/") === "meeting/list",
    );
    expect(meetingList).toBeDefined();
    if (!meetingList) return;
    expect(meetingList.operationId).toBe(AGGREGATE_SENTINEL);
    const ids = meetingList.aggregate?.operationIds ?? [];
    expect(ids).toContain("meeting.request.meeting.list");
    expect(ids).toContain("meeting.session.meeting.list");
    // Aggregated leaves must be registered in the daemon.
    for (const opId of ids) {
      expect(handle.registry.get(opId)).toBeDefined();
    }
  });
});

describe("package-op coverage (every registered op is reachable)", () => {
  test("every registry operation is claimed by a surface leaf or covered by the package-op fallback", () => {
    const claimedByLeaf = new Set<string>();
    let hasPackageOpFallback = false;
    for (const leaf of leafNodes()) {
      if (leaf.operationId === PACKAGE_OP_SENTINEL) {
        hasPackageOpFallback = true;
        continue;
      }
      for (const opId of operationIdsFor(leaf)) {
        claimedByLeaf.add(opId);
      }
    }

    // Every surface-referenced op must exist in the registry (covered by the
    // consistency test above). Here we check the inverse: every registered
    // op either has a dedicated surface leaf or is reachable via package-op.
    const unreachable: string[] = [];
    for (const [opId] of handle.registry.operations) {
      if (claimedByLeaf.has(opId)) continue;
      if (hasPackageOpFallback) continue; // package-op is the catch-all.
      unreachable.push(opId);
    }
    expect(unreachable).toEqual([]);

    // Hard requirement: the fallback exists. Without it, any future op not
    // pinned to a surface leaf becomes invisible to the CLI.
    expect(hasPackageOpFallback).toBe(true);
  });

  test("at most one package-op fallback leaf exists (LOCAL and PACKAGE sentinels do not collide)", () => {
    const fallback = leafNodes().filter(
      (l) => l.operationId === PACKAGE_OP_SENTINEL,
    );
    const local = leafNodes().filter(
      (l) => l.operationId === LOCAL_COMMAND_SENTINEL,
    );
    expect(fallback.length).toBe(1);
    // Local commands may exist independently (e.g. migrate-content); just
    // guard against accidental sentinel collision.
    for (const l of local) {
      expect(l.operationId).not.toBe(PACKAGE_OP_SENTINEL);
    }
  });
});

describe("surface-level coverage of Phase 1 operation IDs", () => {
  // Pins the four Phase 1 IDs to visible, reachable locations so future
  // refactors can't silently drop them.
  const phase1Ops = [
    "system.config.project.list",
    "meeting.session.meeting.list",
    "workspace.issue.list",
    "workspace.issue.read",
  ];

  test("each Phase 1 operationId is referenced by exactly one surface leaf", () => {
    const counts = new Map<string, number>();
    for (const leaf of leafNodes()) {
      for (const opId of operationIdsFor(leaf)) {
        counts.set(opId, (counts.get(opId) ?? 0) + 1);
      }
    }
    for (const opId of phase1Ops) {
      expect(counts.get(opId)).toBe(1);
    }
  });

  test("each Phase 1 operationId is registered in the in-process operations registry", () => {
    for (const opId of phase1Ops) {
      expect(handle.registry.get(opId)).toBeDefined();
    }
  });
});

describe("invocationForOperation — method inference", () => {
  test("SSE stream subscribe resolves to GET (not POST by verb heuristic)", () => {
    // `subscribe` is not in GET_VERBS; without a METHOD_OVERRIDES entry the
    // heuristic would fall through to POST. SSE streams are conventionally
    // GET — pin the behavior so future stream ops get the same treatment via
    // an explicit override rather than silently defaulting to POST.
    const inv = invocationForOperation("system.events.stream.subscribe");
    expect(inv.method).toBe("GET");
    expect(inv.path).toBe("/system/events/stream/subscribe");
  });
});
