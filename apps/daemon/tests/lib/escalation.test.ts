/**
 * Tests for daemon/lib/escalation.ts: shared merge conflict escalation.
 *
 * Verifies:
 * - Commission activity type: reason string contains activity ID and branch name
 * - Meeting activity type: reason string contains activity ID and branch name
 * - Successful createMeetingRequest: function completes without error
 * - Failed createMeetingRequest: error is caught, logged via log.error, not rethrown
 */

import { describe, test, expect } from "bun:test";
import { escalateMergeConflict } from "@/apps/daemon/lib/escalation";
import { collectingLog } from "@/apps/daemon/lib/log";

describe("escalateMergeConflict", () => {
  test("commission activity type: reason contains activity ID and branch name", async () => {
    let capturedParams: { projectName: string; workerName: string; reason: string } | undefined;

    await escalateMergeConflict({
      activityType: "commission",
      activityId: "comm-abc-123",
      branchName: "guild-hall/commission/comm-abc-123",
      projectName: "test-project",
      createMeetingRequest: (params) => {
        capturedParams = params;
        return Promise.resolve();
      },
      managerPackageName: "guild-hall-manager",
    });

    expect(capturedParams).toBeDefined();
    expect(capturedParams!.projectName).toBe("test-project");
    expect(capturedParams!.workerName).toBe("guild-hall-manager");
    expect(capturedParams!.reason).toContain("Commission");
    expect(capturedParams!.reason).toContain("comm-abc-123");
    expect(capturedParams!.reason).toContain("guild-hall/commission/comm-abc-123");
    expect(capturedParams!.reason).toContain("non-.lore/ conflicts");
    expect(capturedParams!.reason).toContain("resolve conflicts manually");
  });

  test("meeting activity type: reason contains activity ID and branch name", async () => {
    let capturedParams: { projectName: string; workerName: string; reason: string } | undefined;

    await escalateMergeConflict({
      activityType: "meeting",
      activityId: "mtg-xyz-789",
      branchName: "guild-hall/meeting/mtg-xyz-789",
      projectName: "other-project",
      createMeetingRequest: (params) => {
        capturedParams = params;
        return Promise.resolve();
      },
      managerPackageName: "custom-manager",
    });

    expect(capturedParams).toBeDefined();
    expect(capturedParams!.projectName).toBe("other-project");
    expect(capturedParams!.workerName).toBe("custom-manager");
    expect(capturedParams!.reason).toContain("Meeting");
    expect(capturedParams!.reason).toContain("mtg-xyz-789");
    expect(capturedParams!.reason).toContain("guild-hall/meeting/mtg-xyz-789");
    expect(capturedParams!.reason).toContain("non-.lore/ conflicts");
    expect(capturedParams!.reason).toContain("resolve conflicts manually");
  });

  test("successful createMeetingRequest: function completes without error", async () => {
    let called = false;

    await escalateMergeConflict({
      activityType: "commission",
      activityId: "comm-ok",
      branchName: "guild-hall/commission/comm-ok",
      projectName: "project-a",
      createMeetingRequest: () => {
        called = true;
        return Promise.resolve();
      },
      managerPackageName: "guild-hall-manager",
    });

    expect(called).toBe(true);
    // No error thrown, function returned normally
  });

  test("failed createMeetingRequest: error is caught, logged, not rethrown", async () => {
    const { log, messages } = collectingLog("escalation");

    // Should not throw even though createMeetingRequest rejects
    await escalateMergeConflict({
      activityType: "meeting",
      activityId: "mtg-fail",
      branchName: "guild-hall/meeting/mtg-fail",
      projectName: "project-b",
      createMeetingRequest: () => {
        return Promise.reject(new Error("Network timeout"));
      },
      managerPackageName: "guild-hall-manager",
      log,
    });

    // log.error should have been called with the failure details
    expect(messages.error.length).toBeGreaterThan(0);
    const errorMsg = messages.error[0];
    expect(errorMsg).toContain("Failed to escalate merge conflict");
    expect(errorMsg).toContain("meeting");
    expect(errorMsg).toContain("mtg-fail");
    expect(errorMsg).toContain("Network timeout");
  });

  test("failed createMeetingRequest with non-Error throwable: logs string representation", async () => {
    const { log, messages } = collectingLog("escalation");

    await escalateMergeConflict({
      activityType: "commission",
      activityId: "comm-str-err",
      branchName: "guild-hall/commission/comm-str-err",
      projectName: "project-c",
      createMeetingRequest: () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject("something went wrong");
      },
      managerPackageName: "guild-hall-manager",
      log,
    });

    expect(messages.error.length).toBeGreaterThan(0);
    const errorMsg = messages.error[0];
    expect(errorMsg).toContain("something went wrong");
  });
});
