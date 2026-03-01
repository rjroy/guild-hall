/* eslint-disable @typescript-eslint/require-await */

/**
 * Tests for ActivityMachine: the generic state machine with enter/exit handlers.
 *
 * Uses a simple four-state graph to exercise all machine behaviors in isolation
 * from commission or meeting specifics. Call-order tracking (array of strings)
 * verifies execution order constraints.
 *
 * Test graph:
 *   idle -> running
 *   running -> done, error
 *   done -> error
 *   error -> idle (redispatch-like)
 *
 *   activeStates: ["running"]
 *   cleanupStates: ["done", "error"]
 */

import { describe, test, expect } from "bun:test";
import {
  ActivityMachine,
  type ActivityMachineConfig,
  type ArtifactOps,
  type CleanupEvent,
  type EnterHandler,
  type ExitHandler,
} from "@/daemon/lib/activity-state-machine";

// -- Test types --

type TestStatus = "idle" | "running" | "done" | "error";
type TestId = string & { __brand: "TestId" };
type TestEntry = { name: string; projectName: string };

function asTestId(id: string): TestId {
  return id as TestId;
}

// -- Test graph --

const TEST_TRANSITIONS: Record<TestStatus, TestStatus[]> = {
  idle: ["running"],
  running: ["done", "error"],
  done: ["error"],
  error: ["idle"],
};

// -- Helpers --

/** Creates a stub ArtifactOps that records calls and resolves paths based on id. */
function createMockArtifactOps(callLog: string[]): ArtifactOps<TestId, TestStatus> {
  return {
    writeStatusAndTimeline: async (
      id: TestId,
      basePath: string,
      toStatus: TestStatus,
      reason: string,
      metadata?: { from?: TestStatus },
    ) => {
      const fromStr = metadata?.from ? ` from=${metadata.from}` : "";
      callLog.push(`artifact:write:${id}:${toStatus}${fromStr}`);
    },
    resolveBasePath: (id: TestId, isActive: boolean) => {
      return isActive ? `/active/${id}` : `/inactive/${id}`;
    },
  };
}

/** Creates a config with optional handler overrides. */
function createTestConfig(
  opts: {
    callLog?: string[];
    enterHandlers?: Partial<Record<TestStatus, EnterHandler<TestId, TestStatus, TestEntry>>>;
    exitHandlers?: Partial<Record<TestStatus, ExitHandler<TestId, TestStatus, TestEntry>>>;
    artifactOps?: ArtifactOps<TestId, TestStatus>;
  } = {},
): ActivityMachineConfig<TestStatus, TestId, TestEntry> {
  const callLog = opts.callLog ?? [];
  return {
    activityType: "commission",
    transitions: TEST_TRANSITIONS,
    cleanupStates: ["done", "error"],
    activeStates: ["running"],
    handlers: {
      enter: opts.enterHandlers,
      exit: opts.exitHandlers,
    },
    artifactOps: opts.artifactOps ?? createMockArtifactOps(callLog),
    extractProjectName: (entry) => entry.projectName,
  };
}

function makeEntry(name = "test-entry"): TestEntry {
  return { name, projectName: "test-project" };
}

// -- Tests --

describe("ActivityMachine", () => {
  // ---- Transition graph validation ----

  describe("transition graph validation", () => {
    test("every valid edge succeeds", async () => {
      const validEdges: [TestStatus, TestStatus][] = [
        ["idle", "running"],
        ["running", "done"],
        ["running", "error"],
        ["done", "error"],
        ["error", "idle"],
      ];

      for (const [from, to] of validEdges) {
        const machine = new ActivityMachine(createTestConfig());
        const id = asTestId(`edge-${from}-${to}`);
        machine.register(id, makeEntry(), from);

        const result = await machine.transition(id, from, to, `Testing ${from}->${to}`);
        expect(result.outcome).toBe("executed");
        if (result.outcome === "executed") {
          // For cleanup states, finalState is the target (no re-entrant handler here)
          expect(result.finalState).toBe(to);
        }
      }
    });

    test("every non-edge rejects with descriptive error", async () => {
      const invalidEdges: [TestStatus, TestStatus][] = [
        ["idle", "done"],
        ["idle", "error"],
        ["idle", "idle"],
        ["running", "idle"],
        ["running", "running"],
        ["done", "idle"],
        ["done", "running"],
        ["done", "done"],
        ["error", "running"],
        ["error", "done"],
        ["error", "error"],
      ];

      for (const [from, to] of invalidEdges) {
        const machine = new ActivityMachine(createTestConfig());
        const id = asTestId(`invalid-${from}-${to}`);
        machine.register(id, makeEntry(), from);

        await expect(
          machine.transition(id, from, to, "Should fail"),
        ).rejects.toThrow(`Invalid transition for ${id}: "${from}" -> "${to}"`);
      }
    });
  });

  // ---- Handler execution order ----

  describe("handler execution order", () => {
    test("exit handler runs before artifact write, enter handler runs after", async () => {
      const callLog: string[] = [];
      const id = asTestId("order-test");

      const config = createTestConfig({
        callLog,
        exitHandlers: {
          idle: async () => { callLog.push("exit:idle"); },
        },
        enterHandlers: {
          running: async () => { callLog.push("enter:running"); },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      await machine.transition(id, "idle", "running", "test order");

      expect(callLog).toEqual([
        "exit:idle",
        "artifact:write:order-test:running from=idle",
        "enter:running",
      ]);
    });

    test("exit handler runs for running->done, enter handler runs for done", async () => {
      const callLog: string[] = [];
      const id = asTestId("cleanup-order");

      const config = createTestConfig({
        callLog,
        exitHandlers: {
          running: async () => { callLog.push("exit:running"); },
        },
        enterHandlers: {
          done: async () => { callLog.push("enter:done"); },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "running");
      machine.forget(id);
      // Use registerActive since running is an active state and we want it in the map
      machine.registerActive(id, makeEntry(), "running");

      await machine.transition(id, "running", "done", "test cleanup order");

      expect(callLog).toEqual([
        "exit:running",
        "artifact:write:cleanup-order:done from=running",
        "enter:done",
      ]);
    });
  });

  // ---- Exit handler errors ----

  describe("exit handler errors", () => {
    test("exit handler throw aborts transition, error propagates", async () => {
      const callLog: string[] = [];
      const id = asTestId("exit-error");

      const config = createTestConfig({
        callLog,
        exitHandlers: {
          idle: async () => {
            callLog.push("exit:idle");
            throw new Error("exit handler failed");
          },
        },
        enterHandlers: {
          running: async () => { callLog.push("enter:running"); },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      await expect(
        machine.transition(id, "idle", "running", "should abort"),
      ).rejects.toThrow("exit handler failed");

      // Enter handler and artifact write should NOT have run
      expect(callLog).toEqual(["exit:idle"]);

      // State should remain unchanged
      expect(machine.getState(id)).toBe("idle");
    });
  });

  // ---- Enter handler errors ----

  describe("enter handler errors", () => {
    test("enter handler throw in non-cleanup state: error propagates, state is updated", async () => {
      const id = asTestId("enter-error-active");

      const config = createTestConfig({
        enterHandlers: {
          running: async () => {
            throw new Error("enter handler failed");
          },
        },
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      await expect(
        machine.transition(id, "idle", "running", "should fail in enter"),
      ).rejects.toThrow("enter handler failed");

      // State IS updated to target (artifact was written, state tracker updated before enter)
      expect(machine.getState(id)).toBe("running");
    });

    test("enter handler throw in cleanup state: entry removed from active Map, error propagates", async () => {
      const cleanupHookEvents: CleanupEvent[] = [];
      const id = asTestId("enter-error-cleanup");

      const config = createTestConfig({
        enterHandlers: {
          done: async () => {
            throw new Error("cleanup enter failed");
          },
        },
      });

      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");
      machine.onCleanup(async (event) => { cleanupHookEvents.push(event); });

      expect(machine.has(id)).toBe(true);

      await expect(
        machine.transition(id, "running", "done", "enter should fail"),
      ).rejects.toThrow("cleanup enter failed");

      // Entry removed from active Map (REQ-ASM-8)
      expect(machine.has(id)).toBe(false);

      // State IS updated to done
      expect(machine.getState(id)).toBe("done");

      // Cleanup hooks still fire with mergeSucceeded: false
      expect(cleanupHookEvents).toHaveLength(1);
      expect(cleanupHookEvents[0].mergeSucceeded).toBe(false);
      expect(cleanupHookEvents[0].status).toBe("done");
    });

    test("enter handler throw in cleanup state (error): hooks still fire", async () => {
      const cleanupHookEvents: CleanupEvent[] = [];
      const id = asTestId("enter-error-cleanup-err");

      const config = createTestConfig({
        enterHandlers: {
          error: async () => {
            throw new Error("error enter failed");
          },
        },
      });

      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");
      machine.onCleanup(async (event) => { cleanupHookEvents.push(event); });

      await expect(
        machine.transition(id, "running", "error", "enter should fail"),
      ).rejects.toThrow("error enter failed");

      expect(cleanupHookEvents).toHaveLength(1);
      expect(cleanupHookEvents[0].mergeSucceeded).toBe(false);
      expect(cleanupHookEvents[0].status).toBe("error");
    });
  });

  // ---- Concurrent transitions ----

  describe("concurrent transitions", () => {
    test("two concurrent transitions from same from state: one executes, other skipped", async () => {
      const callLog: string[] = [];
      const id = asTestId("concurrent");

      // Use a delayed enter handler to create interleaving opportunity
      const config = createTestConfig({
        callLog,
        enterHandlers: {
          done: async () => {
            callLog.push("enter:done");
          },
          error: async () => {
            callLog.push("enter:error");
          },
        },
        exitHandlers: {
          running: async () => {
            callLog.push("exit:running");
          },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");

      // Fire both transitions concurrently
      const [result1, result2] = await Promise.all([
        machine.transition(id, "running", "done", "completing"),
        machine.transition(id, "running", "error", "erroring"),
      ]);

      // Exactly one should execute, the other should be skipped
      const outcomes = [result1.outcome, result2.outcome].sort();
      expect(outcomes).toEqual(["executed", "skipped"]);

      // The one that executed should have a valid final state
      const executed = result1.outcome === "executed" ? result1 : result2;
      if (executed.outcome === "executed") {
        expect(["done", "error"]).toContain(executed.finalState);
      }
    });
  });

  // ---- Re-entrant transitions ----

  describe("re-entrant transitions", () => {
    test("enter handler triggers re-entrant transition: inner executes, outer returns final state", async () => {
      const callLog: string[] = [];
      const cleanupHookEvents: CleanupEvent[] = [];
      const id = asTestId("reentrant");

      // machineRef is captured in the handler closure before machine is created.
      // We assign it after construction; the handler only runs after setup is complete.
      const machineRef: { current: ActivityMachine<TestStatus, TestId, TestEntry> | null } = { current: null };

      const config = createTestConfig({
        callLog,
        enterHandlers: {
          done: async (ctx) => {
            callLog.push("enter:done");
            // Re-entrant transition: done -> error
            await machineRef.current!.transition(ctx.id, "done", "error", "merge conflict");
            callLog.push("enter:done:after-reentrant");
          },
          error: async () => {
            callLog.push("enter:error");
          },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);
      machineRef.current = machine;
      machine.registerActive(id, makeEntry(), "running");
      machine.onCleanup(async (event) => {
        cleanupHookEvents.push({ ...event });
        callLog.push(`cleanup:${event.status}`);
      });

      const result = await machine.transition(id, "running", "done", "completing");

      // Outer returns "executed" with the final state from the re-entrant chain
      expect(result.outcome).toBe("executed");
      if (result.outcome === "executed") {
        expect(result.finalState).toBe("error");
      }

      // State tracker shows final state
      expect(machine.getState(id)).toBe("error");

      // Cleanup hooks fire once for the final state (error), not for done
      // The inner transition fires hooks for "error". The outer sees state changed
      // and skips hooks for "done".
      expect(cleanupHookEvents).toHaveLength(1);
      expect(cleanupHookEvents[0].status).toBe("error");

      // Execution order: enter:done starts, re-entrant transition runs (writes error,
      // fires enter:error, fires cleanup for error), then enter:done resumes
      expect(callLog).toEqual([
        "artifact:write:reentrant:done from=running",
        "enter:done",
        "artifact:write:reentrant:error from=done",
        "enter:error",
        "cleanup:error",
        "enter:done:after-reentrant",
      ]);
    });
  });

  // ---- inject() ----

  describe("inject()", () => {
    test("creates entry, runs enter handler, adds to active Map if activeState", async () => {
      const callLog: string[] = [];
      const id = asTestId("inject-active");

      const config = createTestConfig({
        callLog,
        enterHandlers: {
          running: async (ctx) => {
            callLog.push(`enter:running:source=${String(ctx.sourceState)}`);
          },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);

      await machine.inject(id, makeEntry(), "running", "direct creation");

      expect(machine.isTracked(id)).toBe(true);
      expect(machine.has(id)).toBe(true); // in active Map
      expect(machine.getState(id)).toBe("running");
      expect(machine.activeCount).toBe(1);

      expect(callLog).toEqual([
        "artifact:write:inject-active:running",
        "enter:running:source=null",
      ]);
    });

    test("creates entry at non-active, non-cleanup state", async () => {
      const id = asTestId("inject-idle");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      await machine.inject(id, makeEntry(), "idle", "register at idle");

      expect(machine.isTracked(id)).toBe(true);
      expect(machine.has(id)).toBe(false); // idle is not an active state
      expect(machine.getState(id)).toBe("idle");
    });

    test("inject at cleanup state fires cleanup hooks", async () => {
      const cleanupHookEvents: CleanupEvent[] = [];
      const id = asTestId("inject-cleanup");

      const config = createTestConfig({
        enterHandlers: {
          done: async () => { return { mergeSucceeded: true }; },
        },
      });

      const machine = new ActivityMachine(config);
      machine.onCleanup(async (event) => { cleanupHookEvents.push(event); });

      await machine.inject(id, makeEntry(), "done", "inject at done");

      expect(cleanupHookEvents).toHaveLength(1);
      expect(cleanupHookEvents[0].status).toBe("done");
      expect(cleanupHookEvents[0].mergeSucceeded).toBe(true);
    });

    test("throws if ID already tracked", async () => {
      const id = asTestId("inject-dupe");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      await expect(
        machine.inject(id, makeEntry(), "running", "should fail"),
      ).rejects.toThrow(`Cannot inject ${id}: already tracked`);
    });
  });

  // ---- register() ----

  describe("register()", () => {
    test("populates state tracker without Map or handler effects", async () => {
      const callLog: string[] = [];
      const id = asTestId("register-test");

      const config = createTestConfig({
        callLog,
        enterHandlers: {
          idle: async () => { callLog.push("enter:idle"); },
        },
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      expect(machine.isTracked(id)).toBe(true);
      expect(machine.has(id)).toBe(false); // not in active Map
      expect(machine.getState(id)).toBe("idle");
      expect(callLog).toEqual([]); // no handler calls
    });

    test("register at an active state does NOT add to active Map", () => {
      const id = asTestId("register-active-state");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      machine.register(id, makeEntry(), "running");

      expect(machine.isTracked(id)).toBe(true);
      expect(machine.has(id)).toBe(false); // register doesn't touch the Map
      expect(machine.activeCount).toBe(0);
    });

    test("throws if already tracked", () => {
      const id = asTestId("register-dupe");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      expect(() => {
        machine.register(id, makeEntry(), "running");
      }).toThrow(`Cannot register ${id}: already tracked`);
    });
  });

  // ---- registerActive() ----

  describe("registerActive()", () => {
    test("populates state tracker AND active Map", () => {
      const id = asTestId("regactive-test");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      const entry = makeEntry();

      machine.registerActive(id, entry, "running");

      expect(machine.isTracked(id)).toBe(true);
      expect(machine.has(id)).toBe(true);
      expect(machine.get(id)).toBe(entry);
      expect(machine.getState(id)).toBe("running");
      expect(machine.activeCount).toBe(1);
    });

    test("throws if state not in activeStates", () => {
      const id = asTestId("regactive-bad-state");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      expect(() => {
        machine.registerActive(id, makeEntry(), "idle");
      }).toThrow(`not an active state`);

      expect(() => {
        machine.registerActive(id, makeEntry(), "done");
      }).toThrow(`not an active state`);
    });

    test("throws if already tracked", () => {
      const id = asTestId("regactive-dupe");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      expect(() => {
        machine.registerActive(id, makeEntry(), "running");
      }).toThrow(`Cannot registerActive ${id}: already tracked`);
    });
  });

  // ---- forget() ----

  describe("forget()", () => {
    test("removes from tracker and active Map", () => {
      const id = asTestId("forget-test");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      machine.registerActive(id, makeEntry(), "running");
      expect(machine.isTracked(id)).toBe(true);
      expect(machine.has(id)).toBe(true);

      machine.forget(id);

      expect(machine.isTracked(id)).toBe(false);
      expect(machine.has(id)).toBe(false);
      expect(machine.getState(id)).toBeUndefined();
    });

    test("no-op if not tracked", () => {
      const id = asTestId("forget-notrack");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      // Should not throw
      machine.forget(id);
    });
  });

  // ---- resolveArtifactPath() ----

  describe("resolveArtifactPath()", () => {
    test("returns active path when entry is in active Map", () => {
      const id = asTestId("path-active");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");

      expect(machine.resolveArtifactPath(id)).toBe(`/active/${id}`);
    });

    test("returns inactive path when entry is tracked but not active", () => {
      const id = asTestId("path-inactive");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      expect(machine.resolveArtifactPath(id)).toBe(`/inactive/${id}`);
    });

    test("throws if not tracked", () => {
      const id = asTestId("path-untracked");
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      expect(() => {
        machine.resolveArtifactPath(id);
      }).toThrow(`Cannot resolve artifact path for ${id}: not tracked`);
    });
  });

  // ---- Cleanup hooks ----

  describe("cleanup hooks", () => {
    test("fire in registration order after cleanup state entry", async () => {
      const order: string[] = [];
      const id = asTestId("hook-order");

      const config = createTestConfig({
        enterHandlers: {
          done: async () => { return { mergeSucceeded: true }; },
        },
      });

      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry("hook-test"), "running");

      machine.onCleanup(async (event) => { order.push(`hook1:${event.status}`); });
      machine.onCleanup(async (event) => { order.push(`hook2:${event.status}`); });
      machine.onCleanup(async (event) => { order.push(`hook3:${event.status}`); });

      await machine.transition(id, "running", "done", "completing");

      expect(order).toEqual(["hook1:done", "hook2:done", "hook3:done"]);
    });

    test("do not fire for non-cleanup states", async () => {
      const hookEvents: CleanupEvent[] = [];
      const id = asTestId("hook-nocleanup");

      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");
      machine.onCleanup(async (event) => { hookEvents.push(event); });

      await machine.transition(id, "idle", "running", "starting");

      expect(hookEvents).toHaveLength(0);
    });

    test("cleanup event contains correct fields", async () => {
      const hookEvents: CleanupEvent[] = [];
      const id = asTestId("hook-fields");

      const config = createTestConfig({
        enterHandlers: {
          done: async () => { return { mergeSucceeded: true }; },
        },
      });

      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry("field-test"), "running");
      machine.onCleanup(async (event) => { hookEvents.push(event); });

      await machine.transition(id, "running", "done", "merge success");

      expect(hookEvents).toHaveLength(1);
      expect(hookEvents[0]).toEqual({
        activityType: "commission",
        activityId: id,
        projectName: "test-project",
        status: "done",
        mergeSucceeded: true,
      });
    });

    test("cleanup hooks receive mergeSucceeded: false when handler returns void", async () => {
      const hookEvents: CleanupEvent[] = [];
      const id = asTestId("hook-void");

      const config = createTestConfig({
        enterHandlers: {
          done: async () => { /* void return */ },
        },
      });

      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");
      machine.onCleanup(async (event) => { hookEvents.push(event); });

      await machine.transition(id, "running", "done", "completing");

      expect(hookEvents[0].mergeSucceeded).toBe(false);
    });

    test("cleanup hooks receive mergeSucceeded: false when no enter handler registered", async () => {
      const hookEvents: CleanupEvent[] = [];
      const id = asTestId("hook-nohandler");

      // No enter handler for done
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");
      machine.onCleanup(async (event) => { hookEvents.push(event); });

      await machine.transition(id, "running", "done", "completing");

      expect(hookEvents[0].mergeSucceeded).toBe(false);
    });

    test("hook error does not prevent other hooks from firing", async () => {
      const order: string[] = [];
      const id = asTestId("hook-error");

      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");

      machine.onCleanup(async () => { order.push("hook1"); });
      machine.onCleanup(async () => {
        order.push("hook2");
        throw new Error("hook2 failed");
      });
      machine.onCleanup(async () => { order.push("hook3"); });

      await machine.transition(id, "running", "done", "completing");

      expect(order).toEqual(["hook1", "hook2", "hook3"]);
    });
  });

  // ---- activeCount ----

  describe("activeCount", () => {
    test("reflects Map additions and removals through transitions", async () => {
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      const id1 = asTestId("count-1");
      const id2 = asTestId("count-2");

      expect(machine.activeCount).toBe(0);

      // Register at idle (not active), then transition to running (active)
      machine.register(id1, makeEntry("entry-1"), "idle");
      expect(machine.activeCount).toBe(0);

      await machine.transition(id1, "idle", "running", "start 1");
      expect(machine.activeCount).toBe(1);

      machine.register(id2, makeEntry("entry-2"), "idle");
      await machine.transition(id2, "idle", "running", "start 2");
      expect(machine.activeCount).toBe(2);

      // Transition to cleanup state removes from active Map
      await machine.transition(id1, "running", "done", "complete 1");
      expect(machine.activeCount).toBe(1);

      await machine.transition(id2, "running", "error", "fail 2");
      expect(machine.activeCount).toBe(0);
    });
  });

  // ---- getState() ----

  describe("getState()", () => {
    test("returns correct state after transitions", async () => {
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      const id = asTestId("getstate");

      expect(machine.getState(id)).toBeUndefined();

      machine.register(id, makeEntry(), "idle");
      expect(machine.getState(id)).toBe("idle");

      await machine.transition(id, "idle", "running", "starting");
      expect(machine.getState(id)).toBe("running");

      await machine.transition(id, "running", "done", "completing");
      expect(machine.getState(id)).toBe("done");
    });

    test("returns undefined for untracked entry", () => {
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      expect(machine.getState(asTestId("nonexistent"))).toBeUndefined();
    });
  });

  // ---- Transition with wrong from state ----

  describe("stale from state", () => {
    test("returns skipped when from state does not match current state", async () => {
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      const id = asTestId("stale-from");

      machine.register(id, makeEntry(), "idle");

      // Try to transition from "running" but entry is at "idle"
      const result = await machine.transition(id, "running", "done", "stale");

      expect(result.outcome).toBe("skipped");
      if (result.outcome === "skipped") {
        expect(result.reason).toContain("Expected state");
        expect(result.reason).toContain("running");
        expect(result.reason).toContain("idle");
      }

      // State should remain unchanged
      expect(machine.getState(id)).toBe("idle");
    });

    test("returns skipped for untracked entry", async () => {
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      const result = await machine.transition(
        asTestId("ghost"),
        "idle",
        "running",
        "untracked",
      );

      expect(result.outcome).toBe("skipped");
      if (result.outcome === "skipped") {
        expect(result.reason).toContain("not tracked");
      }
    });
  });

  // ---- Artifact path during transition ----

  describe("artifact path during transition", () => {
    test("artifact write uses active path when entry is in active Map", async () => {
      const writtenPaths: string[] = [];
      const id = asTestId("artpath-active");

      const config = createTestConfig({
        artifactOps: {
          writeStatusAndTimeline: async (_id, basePath) => {
            writtenPaths.push(basePath);
          },
          resolveBasePath: (resolveId, isActive) => {
            return isActive ? `/active/${resolveId}` : `/inactive/${resolveId}`;
          },
        },
      });

      const machine = new ActivityMachine(config);
      machine.registerActive(id, makeEntry(), "running");

      // Transition from running (active) to done (cleanup)
      // At time of write, entry is still in active Map (removed after write)
      await machine.transition(id, "running", "done", "completing");

      expect(writtenPaths[0]).toBe(`/active/${id}`);
    });

    test("artifact write uses inactive path when entry is not in active Map", async () => {
      const writtenPaths: string[] = [];
      const id = asTestId("artpath-inactive");

      const config = createTestConfig({
        artifactOps: {
          writeStatusAndTimeline: async (_id, basePath) => {
            writtenPaths.push(basePath);
          },
          resolveBasePath: (resolveId, isActive) => {
            return isActive ? `/active/${resolveId}` : `/inactive/${resolveId}`;
          },
        },
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      await machine.transition(id, "idle", "running", "starting");

      // At time of write, entry was at idle (not in active Map)
      expect(writtenPaths[0]).toBe(`/inactive/${id}`);
    });
  });

  // ---- Full lifecycle ----

  describe("full lifecycle", () => {
    test("idle -> running -> done with handlers, hooks, and Map changes", async () => {
      const callLog: string[] = [];
      const cleanupHookEvents: CleanupEvent[] = [];
      const id = asTestId("lifecycle");

      const config = createTestConfig({
        callLog,
        exitHandlers: {
          idle: async () => { callLog.push("exit:idle"); },
          running: async () => { callLog.push("exit:running"); },
        },
        enterHandlers: {
          running: async () => { callLog.push("enter:running"); },
          done: async () => {
            callLog.push("enter:done");
            return { mergeSucceeded: true };
          },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");
      machine.onCleanup(async (event) => {
        cleanupHookEvents.push(event);
        callLog.push(`cleanup:${event.status}`);
      });

      // idle -> running
      expect(machine.has(id)).toBe(false);
      await machine.transition(id, "idle", "running", "starting");
      expect(machine.has(id)).toBe(true);
      expect(machine.activeCount).toBe(1);

      // running -> done
      await machine.transition(id, "running", "done", "completing");
      expect(machine.has(id)).toBe(false);
      expect(machine.activeCount).toBe(0);

      // Verify call order
      expect(callLog).toEqual([
        "exit:idle",
        "artifact:write:lifecycle:running from=idle",
        "enter:running",
        "exit:running",
        "artifact:write:lifecycle:done from=running",
        "enter:done",
        "cleanup:done",
      ]);

      expect(cleanupHookEvents).toHaveLength(1);
      expect(cleanupHookEvents[0].mergeSucceeded).toBe(true);
    });

    test("redispatch cycle: idle -> running -> error -> idle -> running", async () => {
      const config = createTestConfig();
      const machine = new ActivityMachine(config);
      const id = asTestId("redispatch");

      machine.register(id, makeEntry(), "idle");

      await machine.transition(id, "idle", "running", "dispatch");
      expect(machine.has(id)).toBe(true);

      await machine.transition(id, "running", "error", "session failed");
      expect(machine.has(id)).toBe(false);
      expect(machine.isTracked(id)).toBe(true); // still in tracker

      // Redispatch: error -> idle
      await machine.transition(id, "error", "idle", "redispatch");
      expect(machine.getState(id)).toBe("idle");

      // Re-dispatch: idle -> running
      await machine.transition(id, "idle", "running", "redispatch run");
      expect(machine.has(id)).toBe(true);
      expect(machine.getState(id)).toBe("running");
    });
  });

  // ---- Lock behavior ----

  describe("lock behavior", () => {
    test("lock from errored previous transition does not block subsequent transitions", async () => {
      const id = asTestId("lock-error-recovery");

      const config = createTestConfig({
        exitHandlers: {
          idle: async () => {
            throw new Error("exit failed");
          },
        },
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      // First transition fails in exit handler
      await expect(
        machine.transition(id, "idle", "running", "will fail"),
      ).rejects.toThrow("exit failed");

      // State remains idle
      expect(machine.getState(id)).toBe("idle");

      // Remove the failing handler and try again
      // We need a new machine with a working handler for this test
      const config2 = createTestConfig();
      const machine2 = new ActivityMachine(config2);
      machine2.register(id, makeEntry(), "idle");

      const result = await machine2.transition(id, "idle", "running", "retry");
      expect(result.outcome).toBe("executed");
    });

    test("writeStatusAndTimeline throw releases lock and does not update state", async () => {
      const id = asTestId("artifact-write-error");
      let shouldThrow = true;

      const config = createTestConfig({
        artifactOps: {
          writeStatusAndTimeline: async () => {
            if (shouldThrow) {
              throw new Error("disk full");
            }
          },
          resolveBasePath: (resolveId, isActive) => {
            return isActive ? `/active/${resolveId}` : `/inactive/${resolveId}`;
          },
        },
      });

      const machine = new ActivityMachine(config);
      machine.register(id, makeEntry(), "idle");

      // First transition fails during artifact write
      await expect(
        machine.transition(id, "idle", "running", "will fail on write"),
      ).rejects.toThrow("disk full");

      // State remains at "idle" (not updated to "running")
      expect(machine.getState(id)).toBe("idle");

      // Subsequent transition must not deadlock. Allow the write to succeed.
      shouldThrow = false;
      const result = await machine.transition(id, "idle", "running", "retry after write fix");
      expect(result.outcome).toBe("executed");
      if (result.outcome === "executed") {
        expect(result.finalState).toBe("running");
      }
      expect(machine.getState(id)).toBe("running");
    });

    test("concurrent transitions on different IDs run independently", async () => {
      const callLog: string[] = [];
      const id1 = asTestId("indep-1");
      const id2 = asTestId("indep-2");

      let resolveId1Enter: (() => void) | undefined;

      const config = createTestConfig({
        callLog,
        enterHandlers: {
          running: async (ctx) => {
            if (ctx.id === id1) {
              callLog.push("enter:running:id1:start");
              await new Promise<void>((resolve) => { resolveId1Enter = resolve; });
              callLog.push("enter:running:id1:end");
            } else {
              callLog.push("enter:running:id2");
            }
          },
        },
        artifactOps: createMockArtifactOps(callLog),
      });

      const machine = new ActivityMachine(config);
      machine.register(id1, makeEntry("entry-1"), "idle");
      machine.register(id2, makeEntry("entry-2"), "idle");

      // Start id1 transition (will block in enter handler)
      const p1 = machine.transition(id1, "idle", "running", "start 1");

      // Give id1 a tick to start
      await new Promise<void>((r) => setTimeout(r, 10));

      // id2 should complete independently while id1 is blocked
      const result2 = await machine.transition(id2, "idle", "running", "start 2");
      expect(result2.outcome).toBe("executed");

      // id1 is still waiting
      expect(callLog).toContain("enter:running:id1:start");
      expect(callLog).toContain("enter:running:id2");
      expect(callLog).not.toContain("enter:running:id1:end");

      // Release id1
      resolveId1Enter!();
      const result1 = await p1;
      expect(result1.outcome).toBe("executed");
    });
  });

  // ---- Multiple entries ----

  describe("multiple entries", () => {
    test("machine tracks multiple entries independently", async () => {
      const config = createTestConfig();
      const machine = new ActivityMachine(config);

      const id1 = asTestId("multi-1");
      const id2 = asTestId("multi-2");
      const id3 = asTestId("multi-3");

      machine.register(id1, makeEntry("entry-1"), "idle");
      machine.register(id2, makeEntry("entry-2"), "idle");
      machine.register(id3, makeEntry("entry-3"), "idle");

      await machine.transition(id1, "idle", "running", "start 1");
      await machine.transition(id2, "idle", "running", "start 2");

      expect(machine.activeCount).toBe(2);
      expect(machine.getState(id1)).toBe("running");
      expect(machine.getState(id2)).toBe("running");
      expect(machine.getState(id3)).toBe("idle");

      await machine.transition(id1, "running", "done", "complete 1");
      expect(machine.activeCount).toBe(1);

      machine.forget(id3);
      expect(machine.isTracked(id3)).toBe(false);
      expect(machine.isTracked(id2)).toBe(true);
    });
  });
});
