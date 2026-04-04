import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createEventBus } from "@/daemon/lib/event-bus";
import type { EventBus, SystemEvent } from "@/daemon/lib/event-bus";
import { ensureHeartbeatFile } from "@/daemon/services/heartbeat/heartbeat-file";
import {
  registerCondensationSubscriber,
  formatTimestamp,
  formatEventLine,
  TERMINAL_STATUSES,
  SUMMARY_MAX_LENGTH,
} from "@/daemon/services/heartbeat/condensation";

let tmpDir: string;
let guildHallHome: string;
let projectPath: string;
let eventBus: EventBus;

const PROJECT_NAME = "test-project";

function heartbeatFilePath(): string {
  return path.join(projectPath, ".lore", "heartbeat.md");
}

async function readHeartbeat(): Promise<string> {
  return fs.readFile(heartbeatFilePath(), "utf-8");
}

/** Creates a commission state file so projectName can be resolved. */
async function writeCommissionState(commissionId: string, projectName: string): Promise<void> {
  const dir = path.join(guildHallHome, "state", "commissions");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${commissionId}.json`),
    JSON.stringify({ commissionId, projectName }),
  );
}

/** Creates a meeting state file so projectName can be resolved. */
async function writeMeetingState(meetingId: string, projectName: string): Promise<void> {
  const dir = path.join(guildHallHome, "state", "meetings");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${meetingId}.json`),
    JSON.stringify({ meetingId, projectName }),
  );
}

/** Waits for the write queue to drain by flushing with a sentinel. */
async function waitForWrites(): Promise<void> {
  // The subscriber uses fire-and-forget async. Give it time to settle.
  await new Promise((r) => setTimeout(r, 50));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "condensation-test-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
  projectPath = path.join(guildHallHome, "projects", PROJECT_NAME);
  await fs.mkdir(projectPath, { recursive: true });
  await ensureHeartbeatFile(projectPath);
  eventBus = createEventBus();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Unit tests for formatTimestamp --

describe("formatTimestamp", () => {
  test("formats midnight as 00:00", () => {
    const d = new Date(2026, 3, 1, 0, 0, 0);
    expect(formatTimestamp(d)).toBe("00:00");
  });

  test("formats afternoon time with zero-padded minutes", () => {
    const d = new Date(2026, 3, 1, 14, 5, 0);
    expect(formatTimestamp(d)).toBe("14:05");
  });

  test("formats single-digit hour with leading zero", () => {
    const d = new Date(2026, 3, 1, 9, 32, 0);
    expect(formatTimestamp(d)).toBe("09:32");
  });
});

// -- Unit tests for formatEventLine --

describe("formatEventLine", () => {
  test("formats terminal commission_status", () => {
    for (const status of TERMINAL_STATUSES) {
      const event: SystemEvent = {
        type: "commission_status",
        commissionId: "comm-1",
        status,
      };
      expect(formatEventLine(event)).toBe(`comm-1 ${status}`);
    }
  });

  test("returns null for non-terminal commission_status", () => {
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "comm-1",
      status: "in_progress",
    };
    expect(formatEventLine(event)).toBeNull();
  });

  test("returns null for queued commission_status", () => {
    // "queued" is not a commission_status event type, but just in case
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "comm-1",
      status: "queued",
    };
    expect(formatEventLine(event)).toBeNull();
  });

  test("formats commission_result with short summary", () => {
    const event: SystemEvent = {
      type: "commission_result",
      commissionId: "comm-2",
      summary: "All tests pass, 3 files modified",
    };
    expect(formatEventLine(event)).toBe("comm-2 result: All tests pass, 3 files modified");
  });

  test("truncates commission_result summary at 200 chars", () => {
    const longSummary = "x".repeat(250);
    const event: SystemEvent = {
      type: "commission_result",
      commissionId: "comm-2",
      summary: longSummary,
    };
    const line = formatEventLine(event)!;
    expect(line).toContain("...");
    // "comm-2 result: " + 200 chars + "..."
    const summaryPart = line.replace("comm-2 result: ", "");
    expect(summaryPart.length).toBe(SUMMARY_MAX_LENGTH + 3);
  });

  test("does not truncate summary at exactly 200 chars", () => {
    const exactSummary = "y".repeat(200);
    const event: SystemEvent = {
      type: "commission_result",
      commissionId: "comm-2",
      summary: exactSummary,
    };
    const line = formatEventLine(event)!;
    expect(line).not.toContain("...");
  });

  test("formats meeting_ended", () => {
    const event: SystemEvent = {
      type: "meeting_ended",
      meetingId: "mtg-1",
    };
    expect(formatEventLine(event)).toBe("Meeting mtg-1 ended");
  });

  test("returns null for non-condensed events", () => {
    const event: SystemEvent = {
      type: "commission_progress",
      commissionId: "comm-1",
      summary: "making progress",
    };
    expect(formatEventLine(event)).toBeNull();
  });
});

// -- Integration tests for registerCondensationSubscriber --

describe("registerCondensationSubscriber", () => {
  test("commission_status (completed) writes summary to Recent Activity", async () => {
    const resolveProjectName = async () => PROJECT_NAME;
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
      resolveProjectName,
    });

    eventBus.emit({
      type: "commission_status",
      commissionId: "commission-Dalton-20260401-140000",
      status: "completed",
      projectName: PROJECT_NAME,
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).toContain("commission-Dalton-20260401-140000 completed");
    expect(content).toMatch(/## Recent Activity\n.*\d{2}:\d{2}/);

    unsub();
  });

  test("commission_result writes truncated summary", async () => {
    const resolveProjectName = async () => PROJECT_NAME;
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
      resolveProjectName,
    });

    const longSummary = "a".repeat(250);
    eventBus.emit({
      type: "commission_result",
      commissionId: "comm-result-1",
      summary: longSummary,
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).toContain("comm-result-1 result:");
    expect(content).toContain("...");

    unsub();
  });

  test("meeting_ended writes summary via state file lookup", async () => {
    await writeMeetingState("mtg-42", PROJECT_NAME);

    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
    });

    eventBus.emit({
      type: "meeting_ended",
      meetingId: "mtg-42",
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).toContain("Meeting mtg-42 ended");

    unsub();
  });

  test("non-terminal commission_status does not write", async () => {
    const resolveProjectName = async () => PROJECT_NAME;
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
      resolveProjectName,
    });

    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-nonterminal",
      status: "in_progress",
      projectName: PROJECT_NAME,
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).not.toContain("comm-nonterminal");

    unsub();
  });

  test("event for unresolvable project is dropped", async () => {
    // No state file exists, so project can't be determined
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
    });

    eventBus.emit({
      type: "commission_result",
      commissionId: "comm-unknown",
      summary: "some result",
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).not.toContain("comm-unknown");

    unsub();
  });

  test("commission_status with projectName uses it directly (no state lookup)", async () => {
    // Don't create a state file; the event carries projectName
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
    });

    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-direct",
      status: "failed",
      projectName: PROJECT_NAME,
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).toContain("comm-direct failed");

    unsub();
  });

  test("commission_status without projectName falls back to state file", async () => {
    await writeCommissionState("comm-fallback", PROJECT_NAME);

    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
    });

    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-fallback",
      status: "abandoned",
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).toContain("comm-fallback abandoned");

    unsub();
  });

  test("timestamp format is HH:MM", async () => {
    const resolveProjectName = async () => PROJECT_NAME;
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
      resolveProjectName,
    });

    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-ts",
      status: "completed",
      projectName: PROJECT_NAME,
    });

    await waitForWrites();
    const content = await readHeartbeat();
    // Match "- HH:MM comm-ts completed"
    expect(content).toMatch(/- \d{2}:\d{2} comm-ts completed/);

    unsub();
  });

  test("concurrent events for same project don't corrupt file", async () => {
    const resolveProjectName = async () => PROJECT_NAME;
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
      resolveProjectName,
    });

    // Emit several events rapidly
    for (let i = 0; i < 5; i++) {
      eventBus.emit({
        type: "commission_status",
        commissionId: `comm-concurrent-${i}`,
        status: "completed",
        projectName: PROJECT_NAME,
      });
    }

    await waitForWrites();
    // Extra wait for serialization queue to fully drain
    await new Promise((r) => setTimeout(r, 100));

    const content = await readHeartbeat();
    for (let i = 0; i < 5; i++) {
      expect(content).toContain(`comm-concurrent-${i} completed`);
    }

    // Verify lines are properly formatted (no garbled content)
    const activitySection = content.split("## Recent Activity")[1];
    const lines = activitySection.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBe(5);

    unsub();
  });

  test("events for wrong project are not written", async () => {
    // Create a second project
    const otherProject = "other-project";
    const otherPath = path.join(guildHallHome, "projects", otherProject);
    await fs.mkdir(otherPath, { recursive: true });
    await ensureHeartbeatFile(otherPath);

    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
    });

    // Emit event for other-project
    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-other",
      status: "completed",
      projectName: otherProject,
    });

    await waitForWrites();

    // Should appear in other-project's heartbeat
    const otherContent = await fs.readFile(
      path.join(otherPath, ".lore", "heartbeat.md"),
      "utf-8",
    );
    expect(otherContent).toContain("comm-other completed");

    // Should NOT appear in test-project's heartbeat
    const testContent = await readHeartbeat();
    expect(testContent).not.toContain("comm-other");

    unsub();
  });

  test("unsubscribe stops further event processing", async () => {
    const resolveProjectName = async () => PROJECT_NAME;
    const unsub = registerCondensationSubscriber({
      eventBus,
      guildHallHome,
      resolveProjectName,
    });

    unsub();

    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-after-unsub",
      status: "completed",
      projectName: PROJECT_NAME,
    });

    await waitForWrites();
    const content = await readHeartbeat();
    expect(content).not.toContain("comm-after-unsub");
  });
});
