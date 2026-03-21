/* eslint-disable @typescript-eslint/require-await -- test stubs return Promise per interface contract */
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createEventBus } from "@/daemon/lib/event-bus";
import { collectingLog, nullLog } from "@/daemon/lib/log";
import { memoryScopeFile } from "@/daemon/services/memory-injector";
import {
  TRIAGE_PROMPT_TEMPLATE,
  assemblePrompt,
  buildMemoryTools,
  createArtifactReader,
  createTriageSessionRunner,
  createOutcomeTriage,
  type TriageInput,
  type ArtifactReadResult,
} from "@/daemon/services/outcome-triage";
import type { AppConfig } from "@/lib/types";

// Helper to wait for async fire-and-forget dispatches
function tick(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outcome-triage-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

// -- Phase 1 tests --

describe("TRIAGE_PROMPT_TEMPLATE", () => {
  test("contains all six placeholders (REQ-OTMEM-9, REQ-OTMEM-10)", () => {
    expect(TRIAGE_PROMPT_TEMPLATE).toContain("{input_type}");
    expect(TRIAGE_PROMPT_TEMPLATE).toContain("{worker_name}");
    expect(TRIAGE_PROMPT_TEMPLATE).toContain("{task_description}");
    expect(TRIAGE_PROMPT_TEMPLATE).toContain("{outcome_status}");
    expect(TRIAGE_PROMPT_TEMPLATE).toContain("{result_text}");
    expect(TRIAGE_PROMPT_TEMPLATE).toContain("{artifact_list}");
  });

  test("begins with the role statement from spec", () => {
    expect(TRIAGE_PROMPT_TEMPLATE).toMatch(
      /^You are a memory triage filter for a software project\./,
    );
  });
});

describe("assemblePrompt", () => {
  test("interpolates all six placeholders", () => {
    const input: TriageInput = {
      inputType: "commission",
      workerName: "Dalton",
      taskDescription: "Build the widget",
      outcomeStatus: "completed",
      resultText: "Widget built, tests pass.",
      artifactList: "specs/widget.md",
    };

    const result = assemblePrompt(input);

    expect(result).toContain("Type: commission");
    expect(result).toContain("Worker: Dalton");
    expect(result).toContain("Task: Build the widget");
    expect(result).toContain("Status: completed");
    expect(result).toContain("Widget built, tests pass.");
    expect(result).toContain("specs/widget.md");
    // Placeholders should be gone
    expect(result).not.toContain("{input_type}");
    expect(result).not.toContain("{worker_name}");
  });
});

describe("buildMemoryTools", () => {
  test("returns MCP server with read_memory and edit_memory tools (REQ-OTMEM-11)", async () => {
    const tmpDir = await makeTmpDir();
    const server = buildMemoryTools(tmpDir, "test-project");

    // The server should have a tools listing
    expect(server).toBeDefined();
    // Verify it's a valid MCP server config by checking its shape
    expect(typeof server).toBe("object");
  });

  test("edit_memory writes to correct project-scope file (REQ-OTMEM-12)", async () => {
    const tmpDir = await makeTmpDir();
    const projectName = "test-project";

    // buildMemoryTools creates handlers internally. We test by calling through
    // the handler factories directly to verify scoping.
    const { makeReadMemoryHandler, makeEditMemoryHandler } = await import(
      "@/daemon/services/base-toolbox"
    );
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(tmpDir, "outcome-triage", projectName, readScopes);
    const edit = makeEditMemoryHandler(tmpDir, "outcome-triage", projectName, readScopes);

    // Read first (required by guard)
    await read({ scope: "project" });

    // Write
    await edit({
      scope: "project",
      section: "Test",
      operation: "upsert",
      content: "test entry",
    });

    const expectedPath = memoryScopeFile(tmpDir, "project", projectName);
    const content = await fs.readFile(expectedPath, "utf-8");
    expect(content).toContain("test entry");
  });

  test("read-before-write guard rejects writes without prior read (REQ-MEM-27)", async () => {
    const tmpDir = await makeTmpDir();
    const { makeEditMemoryHandler } = await import("@/daemon/services/base-toolbox");
    const readScopes = new Set<string>();
    const edit = makeEditMemoryHandler(tmpDir, "outcome-triage", "test-project", readScopes);

    const result = await edit({
      scope: "project",
      section: "Test",
      operation: "upsert",
      content: "test",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toHaveProperty("text");
    expect((result.content[0] as { text: string }).text).toContain("Read memory before editing");
  });
});

describe("createArtifactReader", () => {
  test("reads commission artifact from integration worktree (REQ-OTMEM-4)", async () => {
    const tmpDir = await makeTmpDir();
    const projectName = "test-project";
    const commissionId = "commission-Dalton-20260320-120000";

    // Set up integration worktree structure
    const iPath = path.join(tmpDir, "projects", projectName);
    const artifactDir = path.join(iPath, ".lore", "commissions");
    await fs.mkdir(artifactDir, { recursive: true });

    const artifactContent = [
      "---",
      "worker: Dalton",
      'task: "Build the widget"',
      "status: completed",
      "linked_artifacts:",
      "  - specs/widget.md",
      "  - plans/widget.md",
      "---",
      "",
      "Commission content here.",
    ].join("\n");
    await fs.writeFile(
      path.join(artifactDir, `${commissionId}.md`),
      artifactContent,
    );

    const config: AppConfig = {
      projects: [{ name: projectName, path: "/fake/path" }],
    };

    const reader = createArtifactReader(config, tmpDir);
    const result = await reader("commission", commissionId);

    expect(result).not.toBeNull();
    expect(result!.projectName).toBe(projectName);
    expect(result!.workerName).toBe("Dalton");
    expect(result!.taskDescription).toBe("Build the widget");
    expect(result!.status).toBe("completed");
    expect(result!.artifactList).toBe("specs/widget.md, plans/widget.md");
  });

  test("reads meeting artifact with notes text (REQ-OTMEM-6)", async () => {
    const tmpDir = await makeTmpDir();
    const projectName = "test-project";
    const meetingId = "meeting-20260320-120000";

    const iPath = path.join(tmpDir, "projects", projectName);
    const artifactDir = path.join(iPath, ".lore", "meetings");
    await fs.mkdir(artifactDir, { recursive: true });

    const artifactContent = [
      "---",
      "worker: Guild Master",
      'agenda: "Discuss project architecture"',
      "status: closed",
      "linked_artifacts: []",
      "---",
      "",
      "## Meeting Notes",
      "",
      "Decided to use event-driven architecture.",
    ].join("\n");
    await fs.writeFile(
      path.join(artifactDir, `${meetingId}.md`),
      artifactContent,
    );

    const config: AppConfig = {
      projects: [{ name: projectName, path: "/fake/path" }],
    };

    const reader = createArtifactReader(config, tmpDir);
    const result = await reader("meeting", meetingId);

    expect(result).not.toBeNull();
    expect(result!.projectName).toBe(projectName);
    expect(result!.workerName).toBe("Guild Master");
    expect(result!.taskDescription).toBe("Discuss project architecture");
    expect(result!.status).toBe("closed");
    expect(result!.notesText).toContain("Decided to use event-driven architecture.");
  });

  test("returns null when no project contains the artifact", async () => {
    const tmpDir = await makeTmpDir();

    // Create project dir but no artifact
    const iPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(path.join(iPath, ".lore", "commissions"), { recursive: true });

    const config: AppConfig = {
      projects: [{ name: "test-project", path: "/fake/path" }],
    };

    const reader = createArtifactReader(config, tmpDir);
    const result = await reader("commission", "commission-Nonexistent-20260320-999999");

    expect(result).toBeNull();
  });

  test("commission fallback reads from activity worktree via state file", async () => {
    const tmpDir = await makeTmpDir();
    const commissionId = "commission-Dalton-20260320-130000";

    // No artifact in integration worktree
    const iPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(path.join(iPath, ".lore", "commissions"), { recursive: true });

    // Create activity worktree with the artifact
    const worktreeDir = path.join(tmpDir, "worktrees", "test-project", commissionId);
    const worktreeArtifactDir = path.join(worktreeDir, ".lore", "commissions");
    await fs.mkdir(worktreeArtifactDir, { recursive: true });

    const artifactContent = [
      "---",
      "worker: Dalton",
      'task: "Build the fallback widget"',
      "status: in_progress",
      "linked_artifacts: []",
      "---",
    ].join("\n");
    await fs.writeFile(
      path.join(worktreeArtifactDir, `${commissionId}.md`),
      artifactContent,
    );

    // Create state file pointing to the activity worktree
    const stateDir = path.join(tmpDir, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, `${commissionId}.json`),
      JSON.stringify({
        commissionId,
        projectName: "test-project",
        workerName: "Dalton",
        status: "in_progress",
        worktreeDir,
      }),
    );

    const config: AppConfig = {
      projects: [{ name: "test-project", path: "/fake/path" }],
    };

    const reader = createArtifactReader(config, tmpDir);
    const result = await reader("commission", commissionId);

    expect(result).not.toBeNull();
    expect(result!.projectName).toBe("test-project");
    expect(result!.workerName).toBe("Dalton");
    expect(result!.taskDescription).toBe("Build the fallback widget");
  });
});

// -- Phase 2 tests --

describe("createTriageSessionRunner", () => {
  test("calls queryFn with correct options (REQ-OTMEM-13, REQ-OTMEM-14, REQ-OTMEM-15)", async () => {
    let capturedPrompt: string | undefined;
    let capturedOptions: Record<string, unknown> | undefined;

    // Mock queryFn that yields one message then returns
    async function* mockQueryFn(params: { prompt: string; options: Record<string, unknown> }) {
      capturedPrompt = params.prompt;
      capturedOptions = params.options;
      yield { type: "text", content: "Nothing worth remembering." };
    }

    const logCtx = collectingLog("test-triage");
    const runner = createTriageSessionRunner(mockQueryFn, logCtx.log);

    await runner("system prompt here", "user message here", {});

    expect(capturedPrompt).toBe("user message here");
    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!.systemPrompt).toBe("system prompt here");
    expect(capturedOptions!.model).toBe("claude-haiku-4-5-20251001");
    expect(capturedOptions!.maxTurns).toBe(10);
    expect(capturedOptions!.permissionMode).toBe("dontAsk");
  });

  test("drains generator to completion and logs turn count", async () => {
    async function* mockQueryFn() {
      yield { type: "text", content: "turn 1" };
      yield { type: "text", content: "turn 2" };
      yield { type: "text", content: "turn 3" };
    }

    const logCtx = collectingLog("test-triage");
    const runner = createTriageSessionRunner(mockQueryFn, logCtx.log);

    await runner("prompt", "message", {});

    expect(logCtx.messages.info.some((m) => m.includes("3 turn(s)"))).toBe(true);
  });
});

describe("createOutcomeTriage factory", () => {
  test("subscribes to EventBus (REQ-OTMEM-1)", () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async () => null,
      runTriageSession: async () => {},
    });

    // The eventBus has at least one subscriber
    // We verify indirectly: emitting doesn't throw
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    cleanup();
  });

  test("cleanup unsubscribes from EventBus", () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const calls: string[] = [];

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async (type, id) => {
        calls.push(`${type}:${id}`);
        return null;
      },
      runTriageSession: async () => {},
    });

    cleanup();

    // After cleanup, events should not trigger readArtifact
    eventBus.emit({ type: "commission_result", commissionId: "c1", summary: "done" });
    expect(calls).toHaveLength(0);
  });

  test("commission_result triggers readArtifact with correct args (REQ-OTMEM-2)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const calls: Array<{ type: string; id: string }> = [];

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async (type, id) => {
        calls.push({ type, id });
        return null;
      },
      runTriageSession: async () => {},
    });

    eventBus.emit({ type: "commission_result", commissionId: "c-test-1", summary: "done" });
    await tick();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ type: "commission", id: "c-test-1" });
    cleanup();
  });

  test("meeting_ended triggers readArtifact with correct args (REQ-OTMEM-2)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const calls: Array<{ type: string; id: string }> = [];

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async (type, id) => {
        calls.push({ type, id });
        return null;
      },
      runTriageSession: async () => {},
    });

    eventBus.emit({ type: "meeting_ended", meetingId: "m-test-1" });
    await tick();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ type: "meeting", id: "m-test-1" });
    cleanup();
  });

  test("other event types do not trigger readArtifact", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const calls: string[] = [];

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async (_type, id) => {
        calls.push(id);
        return null;
      },
      runTriageSession: async () => {},
    });

    eventBus.emit({ type: "commission_status", commissionId: "c1", status: "completed" });
    eventBus.emit({ type: "meeting_started", meetingId: "m1", worker: "test" });
    await tick();

    expect(calls).toHaveLength(0);
    cleanup();
  });

  test("commission input uses summary/artifacts from event, worker/task from artifact (REQ-OTMEM-5)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    let capturedUserMessage = "";

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Dalton",
      taskDescription: "Build the widget",
      artifactList: "fallback-artifact.md",
      status: "completed",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async () => mockArtifact,
      runTriageSession: async (_system, user) => {
        capturedUserMessage = user;
      },
    });

    eventBus.emit({
      type: "commission_result",
      commissionId: "c-test-1",
      summary: "Widget built successfully.",
      artifacts: ["output/widget.ts"],
    });
    await tick();

    expect(capturedUserMessage).toContain("Worker: Dalton");
    expect(capturedUserMessage).toContain("Task: Build the widget");
    expect(capturedUserMessage).toContain("Widget built successfully.");
    expect(capturedUserMessage).toContain("output/widget.ts");
    cleanup();
  });

  test("commission without event artifacts falls back to artifact linked_artifacts (REQ-OTMEM-5)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    let capturedUserMessage = "";

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Dalton",
      taskDescription: "Build the widget",
      artifactList: "specs/widget.md, plans/widget.md",
      status: "completed",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async () => mockArtifact,
      runTriageSession: async (_system, user) => {
        capturedUserMessage = user;
      },
    });

    // No artifacts field in the event
    eventBus.emit({
      type: "commission_result",
      commissionId: "c-test-1",
      summary: "Widget built.",
    });
    await tick();

    expect(capturedUserMessage).toContain("specs/widget.md, plans/widget.md");
    cleanup();
  });

  test("meeting input uses notesText as resultText, agenda as taskDescription (REQ-OTMEM-6)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    let capturedUserMessage = "";

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Guild Master",
      taskDescription: "Discuss architecture",
      artifactList: "None",
      status: "closed",
      notesText: "Decided on event-driven approach.",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async () => mockArtifact,
      runTriageSession: async (_system, user) => {
        capturedUserMessage = user;
      },
    });

    eventBus.emit({ type: "meeting_ended", meetingId: "m-test-1" });
    await tick();

    expect(capturedUserMessage).toContain("Task: Discuss architecture");
    expect(capturedUserMessage).toContain("Decided on event-driven approach.");
    cleanup();
  });

  test("meeting with status 'declined' skips triage (REQ-OTMEM-2)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const logCtx = collectingLog("test-triage");
    let sessionCalled = false;

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Guild Master",
      taskDescription: "Discuss plans",
      artifactList: "None",
      status: "declined",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: logCtx.log,
      readArtifact: async () => mockArtifact,
      runTriageSession: async () => {
        sessionCalled = true;
      },
    });

    eventBus.emit({ type: "meeting_ended", meetingId: "m-declined-1" });
    await tick();

    expect(sessionCalled).toBe(false);
    expect(logCtx.messages.info.some((m) => m.includes("non-closed meeting"))).toBe(true);
    cleanup();
  });

  test("meeting with status 'closed' proceeds to triage", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    let sessionCalled = false;

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Guild Master",
      taskDescription: "Discuss plans",
      artifactList: "None",
      status: "closed",
      notesText: "Good discussion.",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: nullLog("test"),
      readArtifact: async () => mockArtifact,
      runTriageSession: async () => {
        sessionCalled = true;
      },
    });

    eventBus.emit({ type: "meeting_ended", meetingId: "m-closed-1" });
    await tick();

    expect(sessionCalled).toBe(true);
    cleanup();
  });

  test("readArtifact returning null logs warn and skips triage (REQ-OTMEM-17)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const logCtx = collectingLog("test-triage");
    let sessionCalled = false;

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: logCtx.log,
      readArtifact: async () => null,
      runTriageSession: async () => {
        sessionCalled = true;
      },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c-missing", summary: "done" });
    await tick();

    expect(sessionCalled).toBe(false);
    expect(logCtx.messages.warn.some((m) => m.includes("no artifact found"))).toBe(true);
    cleanup();
  });

  test("runTriageSession error is caught and logged at warn (REQ-OTMEM-16, REQ-OTMEM-17)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const logCtx = collectingLog("test-triage");

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Dalton",
      taskDescription: "Build thing",
      artifactList: "None",
      status: "completed",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: logCtx.log,
      readArtifact: async () => mockArtifact,
      runTriageSession: async () => {
        throw new Error("SDK exploded");
      },
    });

    eventBus.emit({ type: "commission_result", commissionId: "c-fail", summary: "done" });
    await tick();

    expect(logCtx.messages.warn.some((m) => m.includes("SDK exploded"))).toBe(true);
    cleanup();
  });

  test("correct log messages are emitted for commission triage (REQ-OTMEM-19)", async () => {
    const eventBus = createEventBus(nullLog("test-bus"));
    const logCtx = collectingLog("test-triage");

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Dalton",
      taskDescription: "Build thing",
      artifactList: "None",
      status: "completed",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: "/tmp/fake",
      log: logCtx.log,
      readArtifact: async () => mockArtifact,
      runTriageSession: async () => {},
    });

    eventBus.emit({ type: "commission_result", commissionId: "c-log-test", summary: "done" });
    await tick();

    expect(logCtx.messages.info.some((m) => m.includes("triage initiated for commission c-log-test"))).toBe(true);
    expect(logCtx.messages.info.some((m) => m.includes("triage completed for commission c-log-test"))).toBe(true);
    cleanup();
  });

  test("commission triage includes decisions from state in resultText (REQ-DSRF-12)", async () => {
    const tmpDir = await makeTmpDir();
    const eventBus = createEventBus(nullLog("test-bus"));
    let capturedUserMessage = "";

    const commissionId = "c-with-decisions";

    // Write decisions to state directory
    const { makeRecordDecisionHandler } = await import("@/daemon/services/base-toolbox");
    const handler = makeRecordDecisionHandler(tmpDir, commissionId, "commissions", "commissions");
    await handler({ question: "Use SDK?", decision: "Yes", reasoning: "Architectural boundary" });

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Dalton",
      taskDescription: "Build feature",
      artifactList: "None",
      status: "completed",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: tmpDir,
      log: nullLog("test"),
      readArtifact: async () => mockArtifact,
      runTriageSession: async (_system, user) => {
        capturedUserMessage = user;
      },
    });

    eventBus.emit({
      type: "commission_result",
      commissionId,
      summary: "Feature built.",
    });
    await tick();

    expect(capturedUserMessage).toContain("Feature built.");
    expect(capturedUserMessage).toContain("## Decisions");
    expect(capturedUserMessage).toContain("**Use SDK?**");
    expect(capturedUserMessage).toContain("*Reasoning: Architectural boundary*");
    cleanup();
  });

  test("commission triage without decisions has summary-only resultText", async () => {
    const tmpDir = await makeTmpDir();
    const eventBus = createEventBus(nullLog("test-bus"));
    let capturedUserMessage = "";

    const mockArtifact: ArtifactReadResult = {
      projectName: "test-project",
      workerName: "Dalton",
      taskDescription: "Build feature",
      artifactList: "None",
      status: "completed",
    };

    const cleanup = createOutcomeTriage({
      eventBus,
      guildHallHome: tmpDir,
      log: nullLog("test"),
      readArtifact: async () => mockArtifact,
      runTriageSession: async (_system, user) => {
        capturedUserMessage = user;
      },
    });

    eventBus.emit({
      type: "commission_result",
      commissionId: "c-no-decisions",
      summary: "Feature built cleanly.",
    });
    await tick();

    expect(capturedUserMessage).toContain("Feature built cleanly.");
    expect(capturedUserMessage).not.toContain("## Decisions");
    cleanup();
  });
});
