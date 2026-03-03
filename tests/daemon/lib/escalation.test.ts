/**
 * Tests for daemon/lib/escalation.ts: shared merge conflict escalation.
 *
 * Verifies:
 * - Commission activity type: reason string contains activity ID and branch name
 * - Meeting activity type: reason string contains activity ID and branch name
 * - Successful createMeetingRequest: function completes without error
 * - Failed createMeetingRequest: error is caught, logged via console.error, not rethrown
 */

import { describe, test, expect, spyOn, afterEach } from "bun:test";
import { escalateMergeConflict } from "@/daemon/lib/escalation";

// Capture console.error calls so we can verify error logging without polluting output
let consoleErrorSpy: ReturnType<typeof spyOn<Console, "error">> | undefined;

afterEach(() => {
  if (consoleErrorSpy) {
    consoleErrorSpy.mockRestore();
    consoleErrorSpy = undefined;
  }
});

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
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

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
    });

    // console.error should have been called with the failure details
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorArgs = consoleErrorSpy.mock.calls[0];
    expect(errorArgs[0]).toContain("Failed to escalate merge conflict");
    expect(errorArgs[0]).toContain("meeting");
    expect(errorArgs[0]).toContain("mtg-fail");
    expect(errorArgs[1]).toContain("Network timeout");
  });

  test("failed createMeetingRequest with non-Error throwable: logs string representation", async () => {
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

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
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorArgs = consoleErrorSpy.mock.calls[0];
    expect(errorArgs[1]).toContain("something went wrong");
  });
});
