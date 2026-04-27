import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import matter from "gray-matter";
import { asCommissionId } from "@/apps/daemon/types";
import type { CommissionId } from "@/apps/daemon/types";
import type { GuildHallToolboxDeps } from "@/apps/daemon/services/toolbox-types";
import {
  createCommissionToolboxWithCallbacks,
  commissionToolboxFactory,
  makeReportProgressHandler,
  makeSubmitResultHandler,
  type CommissionToolCallbacks,
} from "@/apps/daemon/services/commission/toolbox";
import { parseActivityTimeline } from "@/lib/commissions";
import { createEventBus } from "@/apps/daemon/lib/event-bus";
import type { EventBus, SystemEvent } from "@/apps/daemon/lib/event-bus";
import { commissionWorktreePath } from "@/lib/paths";

let tmpDir: string;
let guildHallHome: string;
/** The worktree path where resolveWritePath will find the commission artifacts. */
let worktreePath: string;
let commissionId: CommissionId;
let testEventBus: EventBus;
let emittedEvents: SystemEvent[];

const projectName = "test-project";

function makeDeps(overrides?: Partial<GuildHallToolboxDeps>): GuildHallToolboxDeps {
  return {
    guildHallHome,
    projectName,
    contextId: commissionId,
    contextType: "commission",
    workerName: "test-worker",
    eventBus: testEventBus,
    config: { projects: [] },
    ...overrides,
  };
}

function makeCallbacks(overrides?: Partial<CommissionToolCallbacks>): CommissionToolCallbacks {
  return {
    onProgress: overrides?.onProgress ?? (() => {}),
    onResult: overrides?.onResult ?? (() => {}),
  };
}

function artifactPath(): string {
  return path.join(worktreePath, ".lore", "work", "commissions", `${commissionId}.md`);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-comm-toolbox-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
  commissionId = asCommissionId("commission-researcher-20260221-143000");

  // Create the commission worktree directory so resolveWritePath finds it.
  worktreePath = commissionWorktreePath(guildHallHome, projectName, commissionId);
  await fs.mkdir(
    path.join(worktreePath, ".lore", "work", "commissions"),
    { recursive: true },
  );

  // Set up test EventBus to capture emitted events
  emittedEvents = [];
  testEventBus = createEventBus();
  testEventBus.subscribe((event) => { emittedEvents.push(event); });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a test commission artifact with the standard frontmatter structure.
 */
async function writeCommissionArtifact(
  overrides?: Partial<{
    status: string;
    linked_artifacts: string;
    activity_timeline: string;
    current_progress: string;
  }>,
): Promise<void> {
  const status = overrides?.status ?? "in_progress";
  const linkedArtifacts = overrides?.linked_artifacts ?? "linked_artifacts: []";
  const timeline = overrides?.activity_timeline ??
    `activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"`;
  const progress = overrides?.current_progress ?? 'current_progress: ""';

  const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
${linkedArtifacts}
resource_overrides: {}
${timeline}
${progress}
projectName: guild-hall
---
`;

  await fs.writeFile(artifactPath(), content, "utf-8");
}

async function readTimeline() {
  const raw = await fs.readFile(artifactPath(), "utf-8");
  return parseActivityTimeline(raw);
}

async function readLinkedArtifacts(): Promise<string[]> {
  const raw = await fs.readFile(artifactPath(), "utf-8");
  const { data } = matter(raw);
  const linked = data.linked_artifacts;
  if (Array.isArray(linked)) return linked as string[];
  return [];
}

// -- report_progress --

describe("report_progress", () => {
  test("appends timeline entry and updates current_progress", async () => {
    await writeCommissionArtifact();

    const progressReported: string[] = [];
    const callbacks = makeCallbacks({
      onProgress: (summary) => progressReported.push(summary),
    });
    const handler = makeReportProgressHandler(makeDeps(), callbacks);

    const result = await handler({ summary: "Analyzed 3 OAuth libraries" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(
      "Progress reported: Analyzed 3 OAuth libraries",
    );

    // Verify callback was invoked
    expect(progressReported).toEqual(["Analyzed 3 OAuth libraries"]);

    // Verify timeline entry was added
    const timeline = await readTimeline();
    const progressEntries = timeline.filter(
      (e) => e.event === "progress_report",
    );
    expect(progressEntries).toHaveLength(1);
    expect(progressEntries[0].reason).toBe("Analyzed 3 OAuth libraries");

    // Verify current_progress was updated
    const raw = await fs.readFile(artifactPath(), "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.current_progress).toBe("Analyzed 3 OAuth libraries");
  });

  test("multiple progress reports accumulate in timeline", async () => {
    await writeCommissionArtifact();

    const handler = makeReportProgressHandler(makeDeps(), makeCallbacks());

    await handler({ summary: "Step 1 complete" });
    await handler({ summary: "Step 2 complete" });

    const timeline = await readTimeline();
    const progressEntries = timeline.filter(
      (e) => e.event === "progress_report",
    );
    expect(progressEntries).toHaveLength(2);

    // current_progress should show only the latest
    const raw = await fs.readFile(artifactPath(), "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.current_progress).toBe("Step 2 complete");
  });
});

// -- submit_result --

describe("submit_result", () => {
  test("sets result_summary and records in timeline", async () => {
    await writeCommissionArtifact();

    const results: Array<{ summary: string; artifacts?: string[] }> = [];
    const callbacks = makeCallbacks({
      onResult: (summary, artifacts) => results.push({ summary, artifacts }),
    });
    const handler = makeSubmitResultHandler(makeDeps(), callbacks);

    const result = await handler({
      summary: "Found 3 viable OAuth patterns",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(
      "Result submitted: Found 3 viable OAuth patterns",
    );

    // Verify callback was invoked
    expect(results).toHaveLength(1);
    expect(results[0].summary).toBe("Found 3 viable OAuth patterns");

    // Verify result_summary was written to the body
    const raw = await fs.readFile(artifactPath(), "utf-8");
    const parsed = matter(raw);
    expect(parsed.content.trim()).toBe("Found 3 viable OAuth patterns");

    // Verify timeline entry
    const timeline = await readTimeline();
    const resultEntries = timeline.filter(
      (e) => e.event === "result_submitted",
    );
    expect(resultEntries).toHaveLength(1);
    expect(resultEntries[0].reason).toBe("Found 3 viable OAuth patterns");
  });

  test("adds linked_artifacts when provided", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(makeDeps(), makeCallbacks());

    await handler({
      summary: "Research complete",
      artifacts: ["specs/oauth-report.md", "notes/findings.md"],
    });

    const linked = await readLinkedArtifacts();
    expect(linked).toContain("specs/oauth-report.md");
    expect(linked).toContain("notes/findings.md");
  });

  test("second call succeeds and overwrites the result", async () => {
    await writeCommissionArtifact();

    const results: Array<{ summary: string; artifacts?: string[] }> = [];
    const callbacks = makeCallbacks({
      onResult: (summary, artifacts) => results.push({ summary, artifacts }),
    });
    const handler = makeSubmitResultHandler(makeDeps(), callbacks);

    const first = await handler({ summary: "Done" });
    expect(first.isError).toBeUndefined();

    const second = await handler({ summary: "Done again" });
    expect(second.isError).toBeUndefined();
    expect(second.content[0].text).toBe("Result submitted: Done again");

    // Both calls invoke the callback
    expect(results).toHaveLength(2);
    expect(results[1].summary).toBe("Done again");

    // The artifact body reflects the last result
    const raw = await fs.readFile(artifactPath(), "utf-8");
    const parsed = matter(raw);
    expect(parsed.content.trim()).toBe("Done again");
  });

  test("multiple calls each append a timeline entry", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(makeDeps(), makeCallbacks());

    await handler({ summary: "First pass" });
    await handler({ summary: "Second pass" });
    await handler({ summary: "Final pass" });

    const timeline = await readTimeline();
    const resultEntries = timeline.filter(
      (e) => e.event === "result_submitted",
    );
    expect(resultEntries).toHaveLength(3);
    expect(resultEntries[0].reason).toBe("First pass");
    expect(resultEntries[1].reason).toBe("Second pass");
    expect(resultEntries[2].reason).toBe("Final pass");

    // The artifact body reflects the last submission
    const raw = await fs.readFile(artifactPath(), "utf-8");
    const parsed = matter(raw);
    expect(parsed.content.trim()).toBe("Final pass");
  });

  test("works without artifacts parameter", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(makeDeps(), makeCallbacks());
    const result = await handler({ summary: "Minimal result" });

    expect(result.isError).toBeUndefined();

    // linked_artifacts should remain empty
    const linked = await readLinkedArtifacts();
    expect(linked).toEqual([]);
  });
});

// -- commissionToolboxFactory (EventBus bridge) --
//
// These tests verify the factory wires callbacks to EventBus correctly.
// Since we can't invoke tools on the MCP server directly in tests,
// we test through the exported handler factories and separately verify
// that commissionToolboxFactory returns a valid server config.

describe("commissionToolboxFactory", () => {
  test("report_progress emits commission_progress event via EventBus", async () => {
    await writeCommissionArtifact();

    // Use handler factory with EventBus-emitting callbacks (same wiring as commissionToolboxFactory)
    const deps = makeDeps();
    const handler = makeReportProgressHandler(deps, {
      onProgress: (summary) =>
        deps.eventBus.emit({
          type: "commission_progress",
          commissionId: deps.contextId,
          summary,
        }),
      onResult: () => {},
    });

    await handler({ summary: "Progress update" });

    const progressEvents = emittedEvents.filter((e) => e.type === "commission_progress");
    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0]).toEqual({
      type: "commission_progress",
      commissionId: commissionId as string,
      summary: "Progress update",
    });
  });

  test("submit_result emits commission_result event with summary and artifacts", async () => {
    await writeCommissionArtifact();

    const deps = makeDeps();
    const handler = makeSubmitResultHandler(deps, {
      onProgress: () => {},
      onResult: (summary, artifacts) =>
        deps.eventBus.emit({
          type: "commission_result",
          commissionId: deps.contextId,
          summary,
          artifacts,
        }),
    });

    await handler({
      summary: "Result with artifacts",
      artifacts: ["notes/finding.md"],
    });

    const resultEvents = emittedEvents.filter((e) => e.type === "commission_result");
    expect(resultEvents).toHaveLength(1);
    expect(resultEvents[0]).toEqual({
      type: "commission_result",
      commissionId: commissionId as string,
      summary: "Result with artifacts",
      artifacts: ["notes/finding.md"],
    });
  });

  test("submit_result emits event without artifacts when none provided", async () => {
    await writeCommissionArtifact();

    const deps = makeDeps();
    const handler = makeSubmitResultHandler(deps, {
      onProgress: () => {},
      onResult: (summary, artifacts) =>
        deps.eventBus.emit({
          type: "commission_result",
          commissionId: deps.contextId,
          summary,
          artifacts,
        }),
    });

    await handler({ summary: "No artifacts" });

    const resultEvents = emittedEvents.filter((e) => e.type === "commission_result");
    expect(resultEvents).toHaveLength(1);
    const evt = resultEvents[0];
    expect(evt.type).toBe("commission_result");
    if (evt.type === "commission_result") {
      expect(evt.summary).toBe("No artifacts");
      expect(evt.artifacts).toBeUndefined();
    }
  });

  test("second submit_result emits event with updated summary", async () => {
    await writeCommissionArtifact();

    const deps = makeDeps();
    const handler = makeSubmitResultHandler(deps, {
      onProgress: () => {},
      onResult: (summary, artifacts) =>
        deps.eventBus.emit({
          type: "commission_result",
          commissionId: deps.contextId,
          summary,
          artifacts,
        }),
    });

    await handler({ summary: "First" });
    await handler({ summary: "Second" });

    const resultEvents = emittedEvents.filter((e) => e.type === "commission_result");
    expect(resultEvents).toHaveLength(2);
    expect(resultEvents[0].type === "commission_result" && resultEvents[0].summary).toBe("First");
    expect(resultEvents[1].type === "commission_result" && resultEvents[1].summary).toBe("Second");
  });

  test("returns valid MCP server config", () => {
    const toolbox = commissionToolboxFactory(makeDeps());

    expect(toolbox.server.type).toBe("sdk");
    expect(toolbox.server.name).toBe("guild-hall-commission");
    expect(toolbox.server.instance).toBeDefined();
  });
});

// -- Per-closure server isolation --

describe("per-closure server isolation", () => {
  test("each createCommissionToolboxWithCallbacks() call gets its own server", () => {
    const toolbox1 = createCommissionToolboxWithCallbacks(makeDeps(), makeCallbacks());
    const toolbox2 = createCommissionToolboxWithCallbacks(makeDeps(), makeCallbacks());

    expect(toolbox1.type).toBe("sdk");
    expect(toolbox2.type).toBe("sdk");
    expect(toolbox1.name).toBe("guild-hall-commission");
    expect(toolbox2.name).toBe("guild-hall-commission");
    expect(toolbox1.instance).toBeDefined();
    expect(toolbox2.instance).toBeDefined();
    expect(toolbox1.instance).not.toBe(toolbox2.instance);
  });

  test("separate handler instances both accept multiple submissions", async () => {
    await writeCommissionArtifact();

    const handler1 = makeSubmitResultHandler(makeDeps(), makeCallbacks());
    const handler2 = makeSubmitResultHandler(makeDeps(), makeCallbacks());

    const result1 = await handler1({ summary: "Handler 1 first" });
    expect(result1.isError).toBeUndefined();

    const result1Again = await handler1({ summary: "Handler 1 second" });
    expect(result1Again.isError).toBeUndefined();

    const result2 = await handler2({ summary: "Handler 2 first" });
    expect(result2.isError).toBeUndefined();
  });
});

// -- createCommissionToolboxWithCallbacks --

describe("createCommissionToolboxWithCallbacks", () => {
  test("returns MCP server config", () => {
    const result = createCommissionToolboxWithCallbacks(makeDeps(), makeCallbacks());

    expect(result.type).toBe("sdk");
    expect(result.name).toBe("guild-hall-commission");
    expect(result.instance).toBeDefined();
  });
});

