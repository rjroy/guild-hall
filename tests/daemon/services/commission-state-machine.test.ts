import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import {
  VALID_TRANSITIONS,
  isTerminalStatus,
  transitionCommission,
} from "@/daemon/services/commission-state-machine";
import {
  commissionArtifactPath,
  readCommissionStatus,
  readActivityTimeline,
} from "@/daemon/services/commission-artifact-helpers";
import { integrationWorktreePath } from "@/lib/paths";

let tmpDir: string;
let ghHome: string;
let integrationPath: string;
let commissionId: CommissionId;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-state-machine-"));
  ghHome = path.join(tmpDir, "guild-hall-home");
  integrationPath = integrationWorktreePath(ghHome, "test-project");
  commissionId = asCommissionId("commission-researcher-20260221-143000");

  await fs.mkdir(
    path.join(integrationPath, ".lore", "commissions"),
    { recursive: true },
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeCommissionArtifact(status: CommissionStatus): Promise<void> {
  const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;

  const artifactPath = commissionArtifactPath(integrationPath, commissionId);
  await fs.writeFile(artifactPath, content, "utf-8");
}

// -- VALID_TRANSITIONS --

describe("VALID_TRANSITIONS", () => {
  test("defines all seven statuses", () => {
    const statuses: CommissionStatus[] = [
      "pending", "blocked", "dispatched", "in_progress",
      "completed", "failed", "cancelled",
    ];
    for (const s of statuses) {
      expect(VALID_TRANSITIONS[s]).toBeDefined();
    }
  });
});

// -- isTerminalStatus --

describe("isTerminalStatus", () => {
  test("completed is terminal", () => {
    expect(isTerminalStatus("completed")).toBe(true);
  });
  test("failed is terminal", () => {
    expect(isTerminalStatus("failed")).toBe(true);
  });
  test("cancelled is terminal", () => {
    expect(isTerminalStatus("cancelled")).toBe(true);
  });
  test("pending is not terminal", () => {
    expect(isTerminalStatus("pending")).toBe(false);
  });
  test("dispatched is not terminal", () => {
    expect(isTerminalStatus("dispatched")).toBe(false);
  });
  test("in_progress is not terminal", () => {
    expect(isTerminalStatus("in_progress")).toBe(false);
  });
});

// -- transitionCommission --

describe("transitionCommission", () => {
  describe("valid transitions update status and timeline", () => {
    const validEdges: [CommissionStatus, CommissionStatus][] = [
      ["pending", "dispatched"],
      ["pending", "blocked"],
      ["pending", "cancelled"],
      ["blocked", "pending"],
      ["blocked", "cancelled"],
      ["dispatched", "in_progress"],
      ["dispatched", "failed"],
      ["in_progress", "completed"],
      ["in_progress", "failed"],
      ["in_progress", "cancelled"],
    ];

    for (const [from, to] of validEdges) {
      test(`${from} -> ${to} updates status and appends timeline`, async () => {
        await writeCommissionArtifact(from);

        await transitionCommission(
          integrationPath,
          commissionId,
          from,
          to,
          `Transitioning from ${from} to ${to}`,
        );

        const status = await readCommissionStatus(integrationPath, commissionId);
        expect(status).toBe(to);

        const timeline = await readActivityTimeline(integrationPath, commissionId);
        expect(timeline).toHaveLength(2);

        const entry = timeline[1];
        expect(entry.event).toBe(`status_${to}`);
        expect(entry.reason).toBe(`Transitioning from ${from} to ${to}`);
        expect(entry.from).toBe(from);
        expect(entry.to).toBe(to);
        expect(entry.timestamp).toBeDefined();
      });
    }
  });

  test("invalid transition rejects without modifying artifact", async () => {
    await writeCommissionArtifact("completed");

    await expect(
      transitionCommission(
        integrationPath,
        commissionId,
        "completed",
        "pending",
        "Should not happen",
      ),
    ).rejects.toThrow('Invalid commission transition: "completed" -> "pending"');

    // Status should remain unchanged
    const status = await readCommissionStatus(integrationPath, commissionId);
    expect(status).toBe("completed");

    // Timeline should have only the original entry
    const timeline = await readActivityTimeline(integrationPath, commissionId);
    expect(timeline).toHaveLength(1);
  });

  test("transition reason is preserved in timeline entry", async () => {
    await writeCommissionArtifact("pending");
    const reason = "Worker pool selected researcher for dispatch";

    await transitionCommission(
      integrationPath,
      commissionId,
      "pending",
      "dispatched",
      reason,
    );

    const timeline = await readActivityTimeline(integrationPath, commissionId);
    const entry = timeline[1];
    expect(entry.reason).toBe(reason);
  });

  test("multiple transitions accumulate timeline entries", async () => {
    await writeCommissionArtifact("pending");

    await transitionCommission(
      integrationPath,
      commissionId,
      "pending",
      "dispatched",
      "Dispatching to worker",
    );
    await transitionCommission(
      integrationPath,
      commissionId,
      "dispatched",
      "in_progress",
      "Worker started processing",
    );
    await transitionCommission(
      integrationPath,
      commissionId,
      "in_progress",
      "completed",
      "Work finished successfully",
    );

    const status = await readCommissionStatus(integrationPath, commissionId);
    expect(status).toBe("completed");

    const timeline = await readActivityTimeline(integrationPath, commissionId);
    expect(timeline).toHaveLength(4); // created + 3 transitions
    expect(timeline[1].event).toBe("status_dispatched");
    expect(timeline[2].event).toBe("status_in_progress");
    expect(timeline[3].event).toBe("status_completed");
  });
});
