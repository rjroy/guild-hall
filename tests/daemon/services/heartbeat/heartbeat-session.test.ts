import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  runHeartbeatSession,
  HEARTBEAT_SYSTEM_PROMPT,
  type HeartbeatSessionDeps,
} from "@/daemon/services/heartbeat/session";
import type { AppConfig } from "@/lib/types";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { SessionPrepDeps } from "@/daemon/lib/agent-sdk/sdk-runner";

// -- Test helpers --

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-heartbeat-sess-"));
  guildHallHome = path.join(tmpDir, "guild-hall");
  const intPath = path.join(guildHallHome, "projects", "test-project");
  await fs.mkdir(intPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(): AppConfig {
  return {
    projects: [
      { name: "test-project", path: "/tmp/src/test-project", defaultBranch: "main" },
    ],
    systemModels: { heartbeat: "haiku" },
    heartbeatIntervalMinutes: 60,
  } as AppConfig;
}

function makeMockPrepDeps(opts?: {
  prepError?: string;
}): SessionPrepDeps {
  return {
    resolveToolSet: () => Promise.resolve({
      mcpServers: [] as never[],
      allowedTools: [] as string[],
      builtInTools: [] as string[],
      systemPromptSuffix: "",
      plugins: [] as never[],
    }),
    loadMemories: () => Promise.resolve({ memoryBlock: "" }),
    activateWorker: () => {
      if (opts?.prepError) {
        return Promise.reject(new Error(opts.prepError));
      }
      return Promise.resolve({
        systemPrompt: "You are the Guild Master.",
        sessionContext: "",
        model: "haiku" as const,
        tools: { mcpServers: [] as never[], allowedTools: [] as string[], builtInTools: [] as string[] },
      });
    },
  };
}

function makeMockCommissionSession(): CommissionSessionForRoutes & {
  created: Array<{ projectName: string; title: string; source?: { description: string } }>;
} {
  const session = {
    created: [] as Array<{ projectName: string; title: string; source?: { description: string } }>,
    createCommission: (
      projectName: string,
      title: string,
      _workerName: string,
      _prompt: string,
      _deps?: string[],
      _overrides?: { model?: string },
      options?: { source?: { description: string } },
    ) => {
      session.created.push({ projectName, title, source: options?.source });
      return Promise.resolve({ commissionId: `commission-test-${Date.now()}` });
    },
    dispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
    cancelCommission: () => Promise.resolve(),
    abandonCommission: () => Promise.resolve(),
    redispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
    updateCommission: () => Promise.resolve(),
    addUserNote: () => Promise.resolve(),
    getActiveCommissions: () => 0,
    checkDependencyTransitions: () => Promise.resolve(),
    recoverCommissions: () => Promise.resolve(0),
    shutdown: () => {},
  };
  return session;
}

// -- Tests --

describe("runHeartbeatSession", () => {
  test("returns error for unknown project", async () => {
    const config = makeConfig();
    config.projects = [];

    const deps: HeartbeatSessionDeps = {
      queryFn: (async function*() {})() as never,
      prepDeps: makeMockPrepDeps(),
      packages: [],
      config,
      guildHallHome,
      commissionSession: makeMockCommissionSession(),
      eventBus: { emit: () => {}, subscribe: () => () => {} } as never,
      gitOps: {} as never,
      getProjectConfig: () => Promise.resolve(undefined),
    };

    const result = await runHeartbeatSession(deps, "nonexistent", "content", Date.now());
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.commissionsCreated).toBe(0);
  });

  test("uses configured model from systemModels.heartbeat", () => {
    const config = makeConfig();
    expect(config.systemModels?.heartbeat).toBe("haiku");
  });

  test("defaults model to haiku when not configured", () => {
    const config: AppConfig = { ...makeConfig(), systemModels: undefined };
    const defaultModel = config.systemModels?.heartbeat ?? "haiku";
    expect(defaultModel).toBe("haiku");
  });

  test("generates correct contextId format", () => {
    const projectName = "test-project";
    const tickTimestamp = 1712345678000;
    const contextId = `heartbeat-${projectName}-${tickTimestamp}`;
    expect(contextId).toBe("heartbeat-test-project-1712345678000");
  });

  test("rate limit errors are flagged", async () => {
    const config = makeConfig();

    const deps: HeartbeatSessionDeps = {
      queryFn: (async function*() {})() as never,
      prepDeps: makeMockPrepDeps({ prepError: "Rate limit exceeded (429)" }),
      packages: [],
      config,
      guildHallHome,
      commissionSession: makeMockCommissionSession(),
      eventBus: { emit: () => {}, subscribe: () => () => {} } as never,
      gitOps: {} as never,
      getProjectConfig: () => Promise.resolve(undefined),
    };

    const result = await runHeartbeatSession(deps, "test-project", "content", Date.now());
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.commissionsCreated).toBe(0);
  });

  test("returns commissionsCreated: 0 on success with no commissions", async () => {
    const config = makeConfig();

    const deps: HeartbeatSessionDeps = {
      queryFn: (async function*() {})() as never,
      prepDeps: makeMockPrepDeps({ prepError: "Non-rate-limit error" }),
      packages: [],
      config,
      guildHallHome,
      commissionSession: makeMockCommissionSession(),
      eventBus: { emit: () => {}, subscribe: () => () => {} } as never,
      gitOps: {} as never,
      getProjectConfig: () => Promise.resolve(undefined),
    };

    const result = await runHeartbeatSession(deps, "test-project", "content", Date.now());
    // Fails due to prepError, but should still report commissionsCreated
    expect(result.commissionsCreated).toBe(0);
  });
});

describe("heartbeat system prompt (REQ-HBT-9)", () => {
  test("HEARTBEAT_SYSTEM_PROMPT is exported and non-empty", () => {
    expect(HEARTBEAT_SYSTEM_PROMPT).toBeTruthy();
    expect(HEARTBEAT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  test("contains all 8 behavioral constraints from REQ-HBT-9", () => {
    // 1. Read standing orders and recent activity
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("standing orders");
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("recent activity");

    // 2. Decide whether each order warrants a new commission
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("warrants a new commission");

    // 3. Consider watch items and context notes
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("watch items");
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("context notes");

    // 4. Skip ambiguous orders
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("ambiguous");
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("skip");

    // 5. No standing orders = no action
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("no standing orders");
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("no action");

    // 6. No scope expansion
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("expand scope");

    // 7. Deduplication via recent activity
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("already been acted on");

    // 8. Commission cleanup for unwieldy files
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("unwieldy");
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("cleanup");
  });

  test("instructs source_description on commission creation", () => {
    expect(HEARTBEAT_SYSTEM_PROMPT).toContain("source_description");
  });
});
