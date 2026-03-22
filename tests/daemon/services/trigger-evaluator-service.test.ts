import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createEventBus, type SystemEvent } from "@/daemon/lib/event-bus";
import { collectingLog, nullLog } from "@/daemon/lib/log";
import { createEventRouter } from "@/daemon/services/event-router";
import { createTriggerEvaluator, readTriggerArtifact } from "@/daemon/services/trigger-evaluator";
import { createCommissionRecordOps } from "@/daemon/services/commission/record";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { AppConfig } from "@/lib/types";
import type { CommissionId } from "@/daemon/types";

// -- Helpers --

/** Microsecond delay to let fire-and-forget handlers run. */
function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Creates a minimal trigger artifact YAML string. */
function makeTriggerArtifact(opts: {
  title?: string;
  worker?: string;
  prompt?: string;
  status?: string;
  dependencies?: string[];
  matchType?: string;
  matchFields?: Record<string, string>;
  matchProjectName?: string;
  approval?: string;
  maxDepth?: number;
  runsCompleted?: number;
  lastTriggered?: string | null;
  lastSpawnedId?: string | null;
}): string {
  const {
    title = "Test trigger",
    worker = "guild-hall-reviewer",
    prompt = "Review commission {{commissionId}}",
    status = "active",
    dependencies = [],
    matchType = "commission_status",
    matchFields,
    matchProjectName,
    approval,
    maxDepth,
    runsCompleted = 0,
    lastTriggered = null,
    lastSpawnedId = null,
  } = opts;

  const fieldsYaml = matchFields
    ? `\n    fields:\n${Object.entries(matchFields)
        .map(([k, v]) => `      ${k}: "${v}"`)
        .join("\n")}`
    : "";

  const projectNameYaml = matchProjectName
    ? `\n    projectName: ${matchProjectName}`
    : "";

  const approvalYaml = approval ? `\n  approval: ${approval}` : "";
  const maxDepthYaml = maxDepth !== undefined ? `\n  maxDepth: ${maxDepth}` : "";

  const depsYaml = dependencies.length === 0
    ? " []"
    : "\n" + dependencies.map((d) => `  - "${d}"`).join("\n");

  return `---
title: "${title}"
date: 2026-03-21
type: triggered
status: ${status}
tags: [commission, triggered]
worker: ${worker}
prompt: "${prompt}"
dependencies:${depsYaml}
trigger:
  match:
    type: ${matchType}${projectNameYaml}${fieldsYaml}${approvalYaml}${maxDepthYaml}
  runs_completed: ${runsCompleted}
  last_triggered: ${lastTriggered ?? "null"}
  last_spawned_id: ${lastSpawnedId ?? "null"}
activity_timeline:
  - timestamp: 2026-03-21T10:00:00.000Z
    event: created
    reason: "Trigger created"
current_progress: ""
projectName: test-project
---
`;
}

/** Creates a source commission artifact with optional triggered_by block. */
function makeSourceCommission(opts?: {
  triggeredBy?: { source_id: string; trigger_artifact: string; depth: number };
}): string {
  const triggeredByBlock = opts?.triggeredBy
    ? `\ntriggered_by:\n  source_id: ${opts.triggeredBy.source_id}\n  trigger_artifact: ${opts.triggeredBy.trigger_artifact}\n  depth: ${opts.triggeredBy.depth}`
    : "";

  return `---
title: "Commission: Source"
date: 2026-03-21
status: completed
type: one-shot${triggeredByBlock}
tags: [commission]
worker: guild-hall-developer
prompt: "Do something"
dependencies: []
activity_timeline:
  - timestamp: 2026-03-21T10:00:00.000Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: test-project
---
`;
}

interface TestHarness {
  tmpDir: string;
  eventBus: ReturnType<typeof createEventBus>;
  router: ReturnType<typeof createEventRouter>["router"];
  cleanupRouter: () => void;
  evalLog: ReturnType<typeof collectingLog>;
  createCalls: Array<{
    projectName: string;
    title: string;
    workerName: string;
    prompt: string;
    dependencies?: string[];
    options?: Record<string, unknown>;
  }>;
  dispatchCalls: string[];
  triggerEvaluator: ReturnType<typeof createTriggerEvaluator>;
  commissionsDir: string;
  /** Write a trigger artifact and return its path. */
  writeTrigger: (filename: string, content: string) => Promise<string>;
  /** Write a source commission artifact. */
  writeSource: (filename: string, content: string) => Promise<string>;
}

async function makeHarness(opts?: {
  projectName?: string;
  createResult?: { commissionId: string };
}): Promise<TestHarness> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "trigger-eval-"));
  const projectName = opts?.projectName ?? "test-project";

  // Create the directory structure: guildHallHome/projects/<name>/.lore/commissions/
  const commissionsDir = path.join(tmpDir, "projects", projectName, ".lore", "commissions");
  await fs.mkdir(commissionsDir, { recursive: true });

  const eventBus = createEventBus(nullLog("test-bus"));
  const routerLog = collectingLog("event-router");
  const { router, cleanup: cleanupRouter } = createEventRouter({ eventBus, log: routerLog.log });

  const evalLog = collectingLog("trigger-evaluator");
  const recordOps = createCommissionRecordOps();

  const createCalls: TestHarness["createCalls"] = [];
  const dispatchCalls: string[] = [];

  const commissionSession = {
    createCommission: async (
      pn: string, title: string, worker: string, prompt: string,
      deps?: string[], _resourceOverrides?: unknown, options?: Record<string, unknown>,
    ) => {
      createCalls.push({ projectName: pn, title, workerName: worker, prompt, dependencies: deps, options });
      const result = opts?.createResult ?? { commissionId: "spawned-001" };

      // Write a minimal artifact for the spawned commission so appendTimeline works
      const spawnedPath = path.join(commissionsDir, `${result.commissionId}.md`);
      const content = `---
title: "Commission: ${title}"
date: 2026-03-21
status: pending
type: triggered
tags: [commission]
worker: ${worker}
prompt: "${prompt}"
dependencies: []
activity_timeline:
  - timestamp: 2026-03-21T10:00:00.000Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: ${pn}
---
`;
      await fs.writeFile(spawnedPath, content, "utf-8");
      return result;
    },
    dispatchCommission: async (id: CommissionId) => {
      dispatchCalls.push(id as string);
      return { status: "accepted" as const };
    },
  } as unknown as CommissionSessionForRoutes;

  const config: AppConfig = {
    projects: [{ name: projectName, path: "/fake/project/path" }],
  } as AppConfig;

  const triggerEvaluator = createTriggerEvaluator({
    router,
    recordOps,
    commissionSession,
    config,
    guildHallHome: tmpDir,
    log: evalLog.log,
  });

  const writeTrigger = async (filename: string, content: string) => {
    const p = path.join(commissionsDir, filename);
    await fs.writeFile(p, content, "utf-8");
    return p;
  };

  const writeSource = async (filename: string, content: string) => {
    const p = path.join(commissionsDir, filename);
    await fs.writeFile(p, content, "utf-8");
    return p;
  };

  return {
    tmpDir, eventBus, router, cleanupRouter, evalLog,
    createCalls, dispatchCalls, triggerEvaluator, commissionsDir,
    writeTrigger, writeSource,
  };
}

let cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  cleanupDirs = [];
});

function tracked(harness: TestHarness): TestHarness {
  cleanupDirs.push(harness.tmpDir);
  return harness;
}

// -- Tests --

describe("readTriggerArtifact", () => {
  test("coerces gray-matter-parsed field values to strings", async () => {
    const h = tracked(await makeHarness());
    // Write YAML with unquoted values that gray-matter will coerce:
    // "true" -> boolean true, "123" -> number 123
    const rawYaml = `---
title: "Coercion test"
date: 2026-03-21
status: active
type: triggered
tags: [commission, triggered]
worker: guild-hall-reviewer
prompt: "Test coercion"
dependencies: []
trigger:
  match:
    type: commission_status
    fields:
      enabled: true
      count: 123
  approval: auto
  maxDepth: 3
  runs_completed: 0
  last_triggered: null
  last_spawned_id: null
activity_timeline:
  - timestamp: 2026-03-21T10:00:00.000Z
    event: created
    reason: "Test"
current_progress: ""
projectName: test-project
---
`;
    const p = await h.writeTrigger("trigger-coerce.md", rawYaml);
    const data = await readTriggerArtifact(p);
    expect(data.trigger.match.fields).toEqual({ enabled: "true", count: "123" });
    expect(typeof data.trigger.match.fields!.enabled).toBe("string");
    expect(typeof data.trigger.match.fields!.count).toBe("string");
  });

  test("reads all fields from a trigger artifact", async () => {
    const h = tracked(await makeHarness());
    const p = await h.writeTrigger("trigger-001.md", makeTriggerArtifact({
      title: "Review after completion",
      worker: "guild-hall-reviewer",
      prompt: "Review {{commissionId}}",
      matchType: "commission_status",
      matchFields: { status: "completed" },
      approval: "auto",
      maxDepth: 5,
    }));

    const data = await readTriggerArtifact(p);
    expect(data.title).toBe("Review after completion");
    expect(data.worker).toBe("guild-hall-reviewer");
    expect(data.prompt).toBe("Review {{commissionId}}");
    expect(data.trigger.match.type).toBe("commission_status");
    expect(data.trigger.match.fields).toEqual({ status: "completed" });
    expect(data.trigger.approval).toBe("auto");
    expect(data.trigger.maxDepth).toBe(5);
    expect(data.trigger.runs_completed).toBe(0);
  });
});

describe("TriggerEvaluator initialize()", () => {
  test("active triggers register subscriptions during initialize()", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-active.md", makeTriggerArtifact({ status: "active" }));

    await h.triggerEvaluator.initialize();

    // Emit a matching event to verify the subscription is live
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(1);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("paused triggers do not register subscriptions", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-paused.md", makeTriggerArtifact({ status: "paused" }));

    await h.triggerEvaluator.initialize();

    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("completed triggers do not register subscriptions", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-done.md", makeTriggerArtifact({ status: "completed" }));

    await h.triggerEvaluator.initialize();

    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("no active triggers produces inert behavior", async () => {
    const h = tracked(await makeHarness());
    // No trigger files at all

    await h.triggerEvaluator.initialize();

    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });
});

describe("TriggerEvaluator handler: matching and creation", () => {
  test("matching event fires the handler and creates a commission", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-001.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      approval: "confirm",
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(1);
    expect(h.createCalls[0].projectName).toBe("test-project");
    expect(h.createCalls[0].workerName).toBe("guild-hall-reviewer");
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("non-matching event does not fire the handler", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-001.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    // Emit a non-matching event (status: failed, not completed)
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "failed" });
    await tick();

    expect(h.createCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("template variables expand correctly in the created commission's prompt", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-001.md", makeTriggerArtifact({
      prompt: "Review the work from {{commissionId}} which is now {{status}}",
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-xyz", status: "completed" });
    await tick();

    expect(h.createCalls[0].prompt).toBe("Review the work from src-xyz which is now completed");
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("triggered_by frontmatter is written with correct source_id, trigger_artifact, depth", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-review.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls[0].options).toMatchObject({
      type: "triggered",
      sourceTrigger: {
        triggerArtifact: "trigger-review",
        sourceId: "src-001",
        depth: 1,
      },
    });
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });
});

describe("TriggerEvaluator handler: depth computation", () => {
  test("depth is computed from source commission's triggered_by.depth", async () => {
    const h = tracked(await makeHarness());
    // Write source commission with depth 2 from a DIFFERENT trigger
    await h.writeSource("src-deep.md", makeSourceCommission({
      triggeredBy: { source_id: "original", trigger_artifact: "other-trigger", depth: 2 },
    }));
    await h.writeTrigger("trigger-chain.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-deep", status: "completed" });
    await tick();

    expect(h.createCalls[0].options).toMatchObject({
      sourceTrigger: { depth: 3 },
    });
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("depth defaults to 1 when source commission has no triggered_by", async () => {
    const h = tracked(await makeHarness());
    await h.writeSource("src-plain.md", makeSourceCommission());
    await h.writeTrigger("trigger-first.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-plain", status: "completed" });
    await tick();

    expect(h.createCalls[0].options).toMatchObject({
      sourceTrigger: { depth: 1 },
    });
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("depth is 1 for non-commission event sources (meeting_ended)", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-meeting.md", makeTriggerArtifact({
      matchType: "meeting_ended",
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "meeting_ended", meetingId: "mtg-001" });
    await tick();

    expect(h.createCalls[0].options).toMatchObject({
      sourceTrigger: { sourceId: "mtg-001", depth: 1 },
    });
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });
});

describe("TriggerEvaluator handler: source exclusion", () => {
  test("source exclusion skips when source commission's trigger_artifact matches current trigger", async () => {
    const h = tracked(await makeHarness());
    // Source was spawned by THIS trigger
    await h.writeSource("src-loop.md", makeSourceCommission({
      triggeredBy: { source_id: "original", trigger_artifact: "trigger-self", depth: 1 },
    }));
    await h.writeTrigger("trigger-self.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-loop", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("source exclusion does not skip when trigger_artifact is different", async () => {
    const h = tracked(await makeHarness());
    await h.writeSource("src-other.md", makeSourceCommission({
      triggeredBy: { source_id: "original", trigger_artifact: "other-trigger", depth: 1 },
    }));
    await h.writeTrigger("trigger-different.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-other", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(1);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("source exclusion is skipped (fail-open) when source artifact is unreadable", async () => {
    const h = tracked(await makeHarness());
    // Don't write a source artifact, so it can't be read
    await h.writeTrigger("trigger-failopen.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "nonexistent-src", status: "completed" });
    await tick();

    // Should still create the commission (fail-open)
    expect(h.createCalls).toHaveLength(1);
    expect(h.createCalls[0].options).toMatchObject({
      sourceTrigger: { depth: 1 },
    });
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });
});

describe("TriggerEvaluator handler: approval and depth limits", () => {
  test("depth limit downgrades approval from auto to confirm", async () => {
    const h = tracked(await makeHarness());
    await h.writeSource("src-deep.md", makeSourceCommission({
      triggeredBy: { source_id: "original", trigger_artifact: "other", depth: 3 },
    }));
    // maxDepth: 3, source depth: 3, new depth: 4 > maxDepth
    await h.writeTrigger("trigger-limited.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      approval: "auto",
      maxDepth: 3,
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-deep", status: "completed" });
    await tick();

    // Commission is created but NOT dispatched (downgraded to confirm)
    expect(h.createCalls).toHaveLength(1);
    expect(h.dispatchCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("depth limit appends the downgrade timeline entry", async () => {
    const h = tracked(await makeHarness());
    await h.writeSource("src-deep2.md", makeSourceCommission({
      triggeredBy: { source_id: "original", trigger_artifact: "other", depth: 3 },
    }));
    await h.writeTrigger("trigger-limited2.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      approval: "auto",
      maxDepth: 3,
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-deep2", status: "completed" });
    await tick();

    // Read the spawned commission and check for depth_limit timeline entry
    const spawnedPath = path.join(h.commissionsDir, "spawned-001.md");
    const content = await fs.readFile(spawnedPath, "utf-8");
    expect(content).toContain("depth_limit");
    expect(content).toContain("Depth limit reached (depth 4 > maxDepth 3)");
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("approval: auto calls both createCommission and dispatchCommission", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-auto.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      approval: "auto",
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(1);
    expect(h.dispatchCalls).toHaveLength(1);
    expect(h.dispatchCalls[0]).toBe("spawned-001");
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("approval: confirm calls createCommission only", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-confirm.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      approval: "confirm",
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(1);
    expect(h.dispatchCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("omitted approval field defaults to confirm behavior", async () => {
    const h = tracked(await makeHarness());
    // No approval field set (undefined)
    await h.writeTrigger("trigger-default.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      // approval intentionally omitted
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(1);
    expect(h.dispatchCalls).toHaveLength(0);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });
});

describe("TriggerEvaluator handler: state updates", () => {
  test("trigger state (runs_completed, last_triggered, last_spawned_id) is updated after firing", async () => {
    const h = tracked(await makeHarness());
    const triggerPath = await h.writeTrigger("trigger-state.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      runsCompleted: 0,
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    const content = await fs.readFile(triggerPath, "utf-8");
    expect(content).toContain("runs_completed: 1");
    expect(content).toContain("last_spawned_id: spawned-001");
    // last_triggered should be a recent ISO timestamp
    expect(content).toMatch(/last_triggered: 20\d{2}-/);
    // Timeline should record the firing
    expect(content).toContain("fired");
    expect(content).toContain("spawned spawned-001");
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });
});

describe("TriggerEvaluator handler: error handling", () => {
  test("trigger dispatch failures log at warn and don't propagate", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-err.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      // Use a worker that will cause createCommission to throw
      worker: "nonexistent-worker",
    }));

    // Override createCommission to throw
    const session = {
      createCommission: async () => {
        throw new Error("Unknown worker: nonexistent-worker");
      },
      dispatchCommission: async () => ({ status: "accepted" as const }),
    } as unknown as CommissionSessionForRoutes;

    const evalLog = collectingLog("trigger-evaluator-err");
    const eventBus = createEventBus(nullLog("test-bus"));
    const { router, cleanup: cleanupRouter } = createEventRouter({ eventBus, log: nullLog("router") });

    const evaluator = createTriggerEvaluator({
      router,
      recordOps: createCommissionRecordOps(),
      commissionSession: session,
      config: { projects: [{ name: "test-project", path: "/fake" }] } as AppConfig,
      guildHallHome: h.tmpDir,
      log: evalLog.log,
    });

    await evaluator.initialize();
    eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    // Should have logged a warning, not thrown
    expect(evalLog.messages.warn.length).toBeGreaterThan(0);
    expect(evalLog.messages.warn.some((w) => w.includes("Unknown worker"))).toBe(true);

    evaluator.shutdown();
    cleanupRouter();
  });
});

describe("TriggerEvaluator dynamic registration", () => {
  test("registerTrigger adds a subscription dynamically", async () => {
    const h = tracked(await makeHarness());
    await h.triggerEvaluator.initialize(); // no triggers at init

    // Dynamically register a trigger
    const triggerPath = await h.writeTrigger("trigger-dynamic.md", makeTriggerArtifact({
      matchType: "commission_result",
    }));
    await h.triggerEvaluator.registerTrigger(triggerPath, "test-project");

    h.eventBus.emit({ type: "commission_result", commissionId: "src-001", summary: "done" });
    await tick();

    expect(h.createCalls).toHaveLength(1);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("unregisterTrigger removes a subscription dynamically", async () => {
    const h = tracked(await makeHarness());
    const triggerPath = await h.writeTrigger("trigger-removable.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();

    // Verify it fires
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();
    expect(h.createCalls).toHaveLength(1);

    // Unregister
    h.triggerEvaluator.unregisterTrigger("trigger-removable");

    // Should not fire anymore
    h.eventBus.emit({ type: "commission_status", commissionId: "src-002", status: "completed" });
    await tick();
    expect(h.createCalls).toHaveLength(1); // still 1, not 2

    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });

  test("multiple triggers can fire on the same event independently", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-a.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      worker: "guild-hall-reviewer",
      prompt: "Review A for {{commissionId}}",
    }));
    await h.writeTrigger("trigger-b.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
      worker: "guild-hall-test-engineer",
      prompt: "Test B for {{commissionId}}",
    }));

    await h.triggerEvaluator.initialize();
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(2);
    const workers = h.createCalls.map((c) => c.workerName).sort();
    expect(workers).toEqual(["guild-hall-reviewer", "guild-hall-test-engineer"]);
    h.triggerEvaluator.shutdown();
    h.cleanupRouter();
  });
});

describe("TriggerEvaluator shutdown", () => {
  test("shutdown removes all subscriptions", async () => {
    const h = tracked(await makeHarness());
    await h.writeTrigger("trigger-shutdown.md", makeTriggerArtifact({
      matchType: "commission_status",
      matchFields: { status: "completed" },
    }));

    await h.triggerEvaluator.initialize();
    h.triggerEvaluator.shutdown();

    // Events should no longer be handled
    h.eventBus.emit({ type: "commission_status", commissionId: "src-001", status: "completed" });
    await tick();

    expect(h.createCalls).toHaveLength(0);
    h.cleanupRouter();
  });
});
