/* eslint-disable @typescript-eslint/require-await */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, test, expect } from "bun:test";
import {
  createSessionRunner,
  type SessionCallbacks,
  type SessionEventTypes,
  type SessionRunnerDeps,
  type SessionSpec,
} from "@/daemon/services/session-runner";
import type { SystemEvent } from "@/daemon/services/event-bus";
import type {
  ActivationContext,
  ActivationResult,
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";

// -- Test helpers --

/** Default event type names used by all tests (commission-style). */
const TEST_EVENT_TYPES: SessionEventTypes = {
  result: "commission_result",
  progress: "commission_progress",
  question: "commission_question",
};

function makeWorkerMetadata(overrides: Partial<WorkerMetadata> = {}): WorkerMetadata {
  return {
    type: "worker",
    identity: {
      name: "Test Worker",
      description: "A test worker",
      displayTitle: "Test Worker",
    },
    posture: "You are a test worker.",
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "full",
    ...overrides,
  };
}

function makeWorkerPackage(
  workerMeta: WorkerMetadata = makeWorkerMetadata(),
): DiscoveredPackage {
  return {
    name: "test-worker",
    path: "/tmp/test-worker",
    metadata: workerMeta,
  };
}

function makeResolvedToolSet(): ResolvedToolSet {
  return {
    mcpServers: [],
    allowedTools: ["Read"],
  };
}

function makeActivationResult(overrides: Partial<ActivationResult> = {}): ActivationResult {
  return {
    systemPrompt: "You are a test worker.",
    tools: makeResolvedToolSet(),
    resourceBounds: { maxTurns: 10 },
    ...overrides,
  };
}

/**
 * Creates an async generator that yields the given messages, simulating
 * SDK session behavior. Optionally throws an error after all messages.
 */
async function* mockQueryFn(
  messages: unknown[],
  errorToThrow?: Error,
): AsyncGenerator<unknown> {
  for (const msg of messages) {
    yield msg;
  }
  if (errorToThrow) {
    throw errorToThrow;
  }
}

type CallRecord = {
  resolveToolSet: Array<{ worker: WorkerMetadata; context: Record<string, unknown> }>;
  loadMemories: Array<{ workerName: string; projectName: string }>;
  activateWorker: Array<{ pkg: DiscoveredPackage; context: ActivationContext }>;
  queryFn: Array<{ prompt: string; options: Record<string, unknown> }>;
};

/**
 * Creates a full set of mock deps with call recording.
 * Each dep can be overridden individually.
 */
function makeDeps(overrides: Partial<SessionRunnerDeps> = {}): {
  deps: SessionRunnerDeps;
  calls: CallRecord;
  emittedEvents: SystemEvent[];
  subscribedCallbacks: Array<(event: SystemEvent) => void>;
} {
  const calls: CallRecord = {
    resolveToolSet: [],
    loadMemories: [],
    activateWorker: [],
    queryFn: [],
  };
  const emittedEvents: SystemEvent[] = [];
  const subscribedCallbacks: Array<(event: SystemEvent) => void> = [];

  const deps: SessionRunnerDeps = {
    resolveToolSet: async (worker, _packages, context) => {
      calls.resolveToolSet.push({ worker, context: context as Record<string, unknown> });
      return makeResolvedToolSet();
    },
    loadMemories: async (workerName, projectName) => {
      calls.loadMemories.push({ workerName, projectName });
      return { memoryBlock: "", needsCompaction: false };
    },
    activateWorker: async (pkg, context) => {
      calls.activateWorker.push({ pkg, context });
      return makeActivationResult();
    },
    queryFn: (params) => {
      calls.queryFn.push(params);
      return mockQueryFn([
        { type: "system", subtype: "init", session_id: "test-session-1" },
        { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
      ]);
    },
    eventBus: {
      emit: (event: SystemEvent) => { emittedEvents.push(event); },
      subscribe: (cb: (event: SystemEvent) => void) => {
        subscribedCallbacks.push(cb);
        return () => {
          const idx = subscribedCallbacks.indexOf(cb);
          if (idx >= 0) subscribedCallbacks.splice(idx, 1);
        };
      },
    },
    ...overrides,
  };

  return { deps, calls, emittedEvents, subscribedCallbacks };
}

function makeCallbacks(overrides: Partial<SessionCallbacks> = {}): {
  callbacks: SessionCallbacks;
  progressCalls: string[];
  resultCalls: Array<{ summary: string; artifacts?: string[] }>;
  questionCalls: string[];
} {
  const progressCalls: string[] = [];
  const resultCalls: Array<{ summary: string; artifacts?: string[] }> = [];
  const questionCalls: string[] = [];

  return {
    callbacks: {
      onProgress: (s) => progressCalls.push(s),
      onResult: (s, a) => resultCalls.push({ summary: s, artifacts: a }),
      onQuestion: (q) => questionCalls.push(q),
      ...overrides,
    },
    progressCalls,
    resultCalls,
    questionCalls,
  };
}

function makeSpec(overrides: Partial<SessionSpec> = {}): SessionSpec {
  const workerConfig = makeWorkerMetadata();
  return {
    workspaceDir: "/tmp/test-workspace",
    prompt: "Do some work.",
    workerName: "Test Worker",
    workerConfig,
    packages: [makeWorkerPackage(workerConfig)],
    config: { projects: [{ name: "test-project", path: "/tmp/test-project" }] },
    guildHallHome: "/tmp/guild-hall-home",
    abortSignal: new AbortController().signal,
    callbacks: makeCallbacks().callbacks,
    projectName: "test-project",
    projectPath: "/tmp/test-project",
    contextId: "test-context-1",
    contextType: "commission",
    contextIdField: "commissionId",
    eventTypes: TEST_EVENT_TYPES,
    ...overrides,
  };
}

// -- Tests --

describe("createSessionRunner", () => {
  describe("execution order", () => {
    test("calls resolveToolSet, loadMemories, activateWorker, queryFn in correct order", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      await runner.run(spec);

      // All four phases should have been called exactly once
      expect(calls.resolveToolSet).toHaveLength(1);
      expect(calls.loadMemories).toHaveLength(1);
      expect(calls.activateWorker).toHaveLength(1);
      // queryFn called once for the main session, and possibly once for follow-up
      expect(calls.queryFn.length).toBeGreaterThanOrEqual(1);
    });

    test("passes workerConfig to resolveToolSet", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const workerConfig = makeWorkerMetadata({ posture: "custom posture" });
      const spec = makeSpec({ workerConfig, packages: [makeWorkerPackage(workerConfig)] });

      await runner.run(spec);

      expect(calls.resolveToolSet[0].worker.posture).toBe("custom posture");
    });

    test("passes contextType from spec to resolveToolSet", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({ contextType: "meeting" });

      await runner.run(spec);

      expect(calls.resolveToolSet[0].context.contextType).toBe("meeting");
    });

    test("passes workerName and projectName to loadMemories", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({ projectName: "my-project" });

      await runner.run(spec);

      expect(calls.loadMemories[0].workerName).toBe("Test Worker");
      expect(calls.loadMemories[0].projectName).toBe("my-project");
    });

    test("passes activation context with correct fields to activateWorker", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        workspaceDir: "/workspace",
        projectPath: "/project",
        activationExtras: {
          commissionContext: {
            commissionId: "comm-1",
            prompt: "test prompt",
            dependencies: ["dep-1"],
          },
        },
      });

      await runner.run(spec);

      const ctx = calls.activateWorker[0].context;
      expect(ctx.workingDirectory).toBe("/workspace");
      expect(ctx.projectPath).toBe("/project");
      expect(ctx.commissionContext?.commissionId).toBe("comm-1");
    });

    test("passes meetingContext through activationExtras", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        contextType: "meeting",
        contextIdField: "meetingId",
        eventTypes: {
          result: "meeting_result",
          progress: "meeting_progress",
          question: "meeting_question",
        },
        activationExtras: {
          meetingContext: {
            meetingId: "mtg-1",
            agenda: "review design",
            referencedArtifacts: [],
          },
        },
      });

      await runner.run(spec);

      const ctx = calls.activateWorker[0].context;
      expect(ctx.meetingContext?.meetingId).toBe("mtg-1");
      expect(ctx.meetingContext?.agenda).toBe("review design");
    });

    test("passes prompt to queryFn", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({ prompt: "Build the feature." });

      await runner.run(spec);

      expect(calls.queryFn[0].prompt).toBe("Build the feature.");
    });
  });

  describe("callbacks via EventBus", () => {
    test("onResult is invoked when result event fires", async () => {
      const { callbacks, resultCalls } = makeCallbacks();
      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: (_params) => {
          // Simulate the toolbox emitting a result event during the session
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            // The toolbox would emit this event
            for (const cb of subscribedCallbacks) {
              cb({
                type: "commission_result",
                commissionId: "test-context-1",
                summary: "Work completed",
                artifacts: ["file.ts"],
              });
            }
            yield { type: "assistant", message: { content: [{ type: "text", text: "done" }] } };
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({ callbacks, contextId: "test-context-1" });

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(true);
      expect(resultCalls).toHaveLength(1);
      expect(resultCalls[0].summary).toBe("Work completed");
      expect(resultCalls[0].artifacts).toEqual(["file.ts"]);
    });

    test("onProgress is invoked when progress event fires", async () => {
      const { callbacks, progressCalls } = makeCallbacks();
      let callCount = 0;
      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: () => {
          callCount++;
          if (callCount === 1) {
            // Main session: emit progress, then emit result to prevent follow-up
            return (async function* () {
              yield { type: "system", subtype: "init", session_id: "s1" };
              for (const cb of subscribedCallbacks) {
                cb({
                  type: "commission_progress",
                  commissionId: "test-context-1",
                  summary: "Step 1 done",
                });
              }
              // Also emit result so there's no follow-up session
              for (const cb of subscribedCallbacks) {
                cb({
                  type: "commission_result",
                  commissionId: "test-context-1",
                  summary: "Done",
                });
              }
              yield { type: "assistant", message: { content: [{ type: "text", text: "working" }] } };
            })();
          }
          // Follow-up session (shouldn't be reached)
          return (async function* () {})();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({ callbacks, contextId: "test-context-1" });

      await runner.run(spec);

      expect(progressCalls).toHaveLength(1);
      expect(progressCalls[0]).toBe("Step 1 done");
    });

    test("onQuestion is invoked when question event fires", async () => {
      const { callbacks, questionCalls } = makeCallbacks();
      let callCount = 0;
      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: () => {
          callCount++;
          if (callCount === 1) {
            return (async function* () {
              yield { type: "system", subtype: "init", session_id: "s1" };
              for (const cb of subscribedCallbacks) {
                cb({
                  type: "commission_question",
                  commissionId: "test-context-1",
                  question: "Should I use pattern A or B?",
                });
              }
              // Also emit result so there's no follow-up session
              for (const cb of subscribedCallbacks) {
                cb({
                  type: "commission_result",
                  commissionId: "test-context-1",
                  summary: "Done",
                });
              }
              yield { type: "assistant", message: { content: [{ type: "text", text: "asked" }] } };
            })();
          }
          return (async function* () {})();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({ callbacks, contextId: "test-context-1" });

      await runner.run(spec);

      expect(questionCalls).toHaveLength(1);
      expect(questionCalls[0]).toBe("Should I use pattern A or B?");
    });

    test("events for different contextIds are ignored", async () => {
      const { callbacks, resultCalls } = makeCallbacks();
      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: () => {
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            // Event for a different context
            for (const cb of subscribedCallbacks) {
              cb({
                type: "commission_result",
                commissionId: "other-context",
                summary: "Wrong context",
              });
            }
            yield { type: "assistant", message: { content: [{ type: "text", text: "done" }] } };
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({ callbacks, contextId: "my-context" });

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(false);
      expect(resultCalls).toHaveLength(0);
    });

    test("uses contextIdField to match events (meeting scenario)", async () => {
      const { callbacks, resultCalls } = makeCallbacks();
      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: () => {
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            for (const cb of subscribedCallbacks) {
              // Event uses meetingId field, matching the spec's contextIdField
              cb({
                type: "meeting_ended",
                meetingId: "mtg-1",
                summary: "Meeting done",
              } as unknown as SystemEvent);
            }
            yield { type: "assistant", message: { content: [{ type: "text", text: "done" }] } };
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        callbacks,
        contextId: "mtg-1",
        contextType: "meeting",
        contextIdField: "meetingId",
        eventTypes: {
          result: "meeting_ended",
          progress: "meeting_progress",
          question: "meeting_question",
        },
      });

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(true);
      expect(resultCalls).toHaveLength(1);
    });
  });

  describe("resultSubmitted tracking", () => {
    test("resultSubmitted is true when onResult callback was triggered", async () => {
      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: () => {
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            for (const cb of subscribedCallbacks) {
              cb({
                type: "commission_result",
                commissionId: "ctx-1",
                summary: "Done",
              });
            }
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({ contextId: "ctx-1" });

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(true);
      expect(result.aborted).toBe(false);
    });

    test("resultSubmitted is false when no result event fires", async () => {
      const { deps } = makeDeps({
        queryFn: () => mockQueryFn([
          { type: "system", subtype: "init", session_id: "s1" },
          { type: "assistant", message: { content: [{ type: "text", text: "no result" }] } },
        ]),
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      const result = await runner.run(spec);

      // Follow-up session also didn't submit, so resultSubmitted remains false
      expect(result.resultSubmitted).toBe(false);
    });
  });

  describe("terminal state guard (REQ-CLS-24)", () => {
    test("abort after completion is a no-op", async () => {
      const abortController = new AbortController();
      const { callbacks, resultCalls } = makeCallbacks();
      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: () => {
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            // Emit result first
            for (const cb of subscribedCallbacks) {
              cb({
                type: "commission_result",
                commissionId: "ctx-guard",
                summary: "Completed first",
              });
            }
            yield { type: "assistant", message: { content: [{ type: "text", text: "done" }] } };
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        callbacks,
        contextId: "ctx-guard",
        abortSignal: abortController.signal,
      });

      const result = await runner.run(spec);

      // Now abort after completion
      abortController.abort();

      // Result should reflect completion, not abort
      expect(result.resultSubmitted).toBe(true);
      expect(result.aborted).toBe(false);
      expect(resultCalls).toHaveLength(1);
    });

    test("settle stores first outcome and ignores subsequent ones", async () => {
      const abortController = new AbortController();
      const { callbacks } = makeCallbacks();

      const { deps, subscribedCallbacks } = makeDeps({
        queryFn: () => {
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            // Abort mid-session
            abortController.abort();
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            throw abortError;
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        callbacks,
        contextId: "ctx-guard-2",
        abortSignal: abortController.signal,
      });

      const result = await runner.run(spec);

      // Then simulate a late result event (after abort settled)
      for (const cb of subscribedCallbacks) {
        cb({
          type: "commission_result",
          commissionId: "ctx-guard-2",
          summary: "Late result",
        });
      }

      // The first outcome (abort) should win
      expect(result.aborted).toBe(true);
      // The late result should not affect the returned result
      // (it may update the local flag, but the settled outcome is fixed)
    });

    test("already-aborted signal returns immediately", async () => {
      const abortController = new AbortController();
      abortController.abort(); // Pre-abort

      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({ abortSignal: abortController.signal });

      const result = await runner.run(spec);

      expect(result.aborted).toBe(true);
      expect(result.resultSubmitted).toBe(false);
      // Should not have called any deps
      expect(calls.resolveToolSet).toHaveLength(0);
      expect(calls.queryFn).toHaveLength(0);
    });
  });

  describe("abort signal cancels SDK session", () => {
    test("AbortError from queryFn returns aborted result", async () => {
      const abortController = new AbortController();
      const { deps } = makeDeps({
        queryFn: () => {
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            abortController.abort();
            const err = new Error("Aborted");
            err.name = "AbortError";
            throw err;
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({ abortSignal: abortController.signal });

      const result = await runner.run(spec);

      expect(result.aborted).toBe(true);
    });
  });

  describe("error handling", () => {
    test("worker package not found returns error result", async () => {
      const { deps } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        workerName: "Nonexistent Worker",
        packages: [], // No packages
      });

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.aborted).toBe(false);
    });

    test("resolveToolSet failure returns error result", async () => {
      const { deps } = makeDeps({
        resolveToolSet: async () => {
          throw new Error("Toolbox resolution exploded");
        },
      });
      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(false);
      expect(result.error).toContain("Tool resolution failed");
      expect(result.aborted).toBe(false);
    });

    test("activateWorker failure returns error result", async () => {
      const { deps } = makeDeps({
        activateWorker: async () => {
          throw new Error("Activation failed");
        },
      });
      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(false);
      expect(result.error).toContain("Worker activation failed");
      expect(result.aborted).toBe(false);
    });

    test("SDK session error returns error result", async () => {
      const { deps } = makeDeps({
        queryFn: () => mockQueryFn(
          [{ type: "system", subtype: "init", session_id: "s1" }],
          new Error("SDK crash"),
        ),
      });
      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      const result = await runner.run(spec);

      expect(result.resultSubmitted).toBe(false);
      expect(result.error).toContain("SDK session error");
      expect(result.aborted).toBe(false);
    });

    test("loadMemories failure is non-fatal (session continues)", async () => {
      const { deps, calls } = makeDeps({
        loadMemories: async () => {
          throw new Error("Memory read failed");
        },
      });
      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      await runner.run(spec);

      // Session should still run despite memory failure
      expect(calls.activateWorker).toHaveLength(1);
      expect(calls.queryFn.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("follow-up session", () => {
    test("runs follow-up when main session completes without result", async () => {
      const { deps, calls } = makeDeps({
        queryFn: (params) => {
          calls.queryFn.push(params);
          return mockQueryFn([
            { type: "system", subtype: "init", session_id: "s1" },
            { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
          ]);
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      await runner.run(spec);

      // Main session + follow-up session = 2 calls
      expect(calls.queryFn).toHaveLength(2);
      // Follow-up prompt should mention submit_result
      expect(calls.queryFn[1].prompt).toContain("submit_result");
    });

    test("uses custom followUpPrompt when provided", async () => {
      const { deps, calls } = makeDeps({
        queryFn: (params) => {
          calls.queryFn.push(params);
          return mockQueryFn([
            { type: "system", subtype: "init", session_id: "s1" },
            { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
          ]);
        },
      });

      const runner = createSessionRunner(deps);
      const customPrompt = "You must call submit_result. The commission depends on it.";
      const spec = makeSpec({ followUpPrompt: customPrompt });

      await runner.run(spec);

      expect(calls.queryFn).toHaveLength(2);
      expect(calls.queryFn[1].prompt).toBe(customPrompt);
    });

    test("skips follow-up when no session_id was captured", async () => {
      const { deps, calls } = makeDeps({
        queryFn: (params) => {
          calls.queryFn.push(params);
          // No system/init message, so no session_id captured
          return mockQueryFn([
            { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
          ]);
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      const result = await runner.run(spec);

      // Only the main session, no follow-up
      expect(calls.queryFn).toHaveLength(1);
      expect(result.resultSubmitted).toBe(false);
      expect(result.error).toContain("no session_id");
    });

    test("skips follow-up when result was submitted during main session", async () => {
      const { deps, calls, subscribedCallbacks } = makeDeps({
        queryFn: (params) => {
          calls.queryFn.push(params);
          return (async function* () {
            yield { type: "system", subtype: "init", session_id: "s1" };
            for (const cb of subscribedCallbacks) {
              cb({
                type: "commission_result",
                commissionId: "ctx-follow",
                summary: "Done in main",
              });
            }
          })();
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec({ contextId: "ctx-follow" });

      const result = await runner.run(spec);

      expect(calls.queryFn).toHaveLength(1);
      expect(result.resultSubmitted).toBe(true);
    });
  });

  describe("resource overrides", () => {
    test("passes resource overrides to SDK options", async () => {
      const { deps, calls } = makeDeps();
      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        resourceOverrides: { maxTurns: 50, maxBudgetUsd: 2.5 },
      });

      await runner.run(spec);

      const options = calls.queryFn[0].options;
      expect(options.maxTurns).toBe(50);
      expect(options.maxBudgetUsd).toBe(2.5);
    });

    test("worker defaults used when no overrides provided", async () => {
      const workerConfig = makeWorkerMetadata({
        resourceDefaults: { maxTurns: 100 },
      });
      const { deps, calls } = makeDeps({
        activateWorker: async () => makeActivationResult({
          resourceBounds: { maxTurns: 100 },
        }),
      });
      const runner = createSessionRunner(deps);
      const spec = makeSpec({
        workerConfig,
        packages: [makeWorkerPackage(workerConfig)],
      });

      await runner.run(spec);

      const options = calls.queryFn[0].options;
      expect(options.maxTurns).toBe(100);
    });
  });

  describe("EventBus unsubscription", () => {
    test("unsubscribes from EventBus after session completes", async () => {
      const subscriberCount = { current: 0 };
      const { deps } = makeDeps({
        eventBus: {
          emit: () => {},
          subscribe: (_cb: (event: SystemEvent) => void) => {
            subscriberCount.current++;
            return () => { subscriberCount.current--; };
          },
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      await runner.run(spec);

      expect(subscriberCount.current).toBe(0);
    });

    test("unsubscribes from EventBus even when session errors", async () => {
      const subscriberCount = { current: 0 };
      const { deps } = makeDeps({
        eventBus: {
          emit: () => {},
          subscribe: (_cb: (event: SystemEvent) => void) => {
            subscriberCount.current++;
            return () => { subscriberCount.current--; };
          },
        },
        resolveToolSet: async () => {
          throw new Error("boom");
        },
      });

      const runner = createSessionRunner(deps);
      const spec = makeSpec();

      await runner.run(spec);

      expect(subscriberCount.current).toBe(0);
    });
  });

  describe("layer 4 isolation (REQ-CLS-23)", () => {
    test("session-runner.ts has no commission-domain knowledge", async () => {
      const sourceFile = path.resolve(
        import.meta.dir,
        "../../../daemon/services/session-runner.ts",
      );
      const source = await fs.readFile(sourceFile, "utf-8");

      // Should not import from @/daemon/types (CommissionId, CommissionStatus, etc.)
      expect(source).not.toContain("from \"@/daemon/types\"");
      expect(source).not.toContain("from '@/daemon/types'");

      // Should not import from commission layer modules
      expect(source).not.toContain("commission-handlers");
      expect(source).not.toContain("commission-session");
      expect(source).not.toContain("commission-artifact");
      expect(source).not.toContain("commission-sdk-logging");

      // Should not reference CommissionId or CommissionStatus types
      expect(source).not.toContain("CommissionId");
      expect(source).not.toContain("CommissionStatus");

      // Should not have hardcoded event type string literals
      expect(source).not.toContain('"commission_result"');
      expect(source).not.toContain('"commission_progress"');
      expect(source).not.toContain('"commission_question"');

      // Should not check for "commissionId" field by name
      expect(source).not.toContain('"commissionId"');

      // Should not hardcode contextType: "commission" as a value assignment.
      // Type definitions like `contextType: "commission" | "meeting"` are fine;
      // what we check for is a bare assignment without the union pipe.
      expect(source).not.toMatch(/contextType:\s*"commission"\s*[,;}\n]/);

      // Should not have a commissionContext field on SessionSpec
      expect(source).not.toMatch(/commissionContext\??\s*:/);
    });
  });
});
