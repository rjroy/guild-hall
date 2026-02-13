import { describe, expect, it } from "bun:test";

import type { SessionMetadata, SSEEvent, StoredMessage } from "@/lib/types";
import {
  addUserMessage,
  applySSEEvent,
  type ClockFn,
  initialState,
  setSessionError,
  setSessionLoaded,
  type WorkshopState,
} from "@/lib/workshop-state";

const FIXED_TIMESTAMP = "2026-02-12T14:00:00.000Z";
const fixedClock: ClockFn = () => FIXED_TIMESTAMP;

// -- Assertion helpers --

/** Narrows state to guarantee session is non-null. Fails the test if null. */
function assertSession(
  state: WorkshopState,
): asserts state is WorkshopState & {
  session: NonNullable<WorkshopState["session"]>;
} {
  expect(state.session).not.toBeNull();
}

/** Narrows a Map.get result to guarantee it is defined. Fails the test if undefined. */
function assertDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

// -- Fixtures --

function makeMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: "session-1",
    name: "Test Session",
    status: "idle",
    guildMembers: ["filesystem"],
    sdkSessionId: null,
    createdAt: "2026-02-12T12:00:00.000Z",
    lastActivityAt: "2026-02-12T12:00:00.000Z",
    messageCount: 0,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    role: "user",
    content: "Hello",
    timestamp: "2026-02-12T12:00:00.000Z",
    ...overrides,
  };
}

function loadedState(
  metadataOverrides: Partial<SessionMetadata> = {},
  messages: StoredMessage[] = [],
): WorkshopState {
  const metadata = makeMetadata(metadataOverrides);
  return setSessionLoaded(initialState(), metadata, messages);
}

// -- Tests --

describe("Workshop state machine", () => {
  describe("initialState", () => {
    it("starts with loading true and no session", () => {
      const state = initialState();
      expect(state.loading).toBe(true);
      expect(state.session).toBeNull();
      expect(state.error).toBeNull();
      expect(state.streamingText).toBe("");
      expect(state.pendingToolCalls.size).toBe(0);
      expect(state.status).toBe("idle");
    });
  });

  describe("setSessionLoaded", () => {
    it("sets session data and clears loading", () => {
      const metadata = makeMetadata();
      const messages = [makeMessage()];
      const state = setSessionLoaded(initialState(), metadata, messages);

      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      assertSession(state);
      expect(state.session.metadata.id).toBe("session-1");
      expect(state.session.messages).toHaveLength(1);
    });

    it("sets status from metadata", () => {
      const state = setSessionLoaded(
        initialState(),
        makeMetadata({ status: "running" }),
        [],
      );
      expect(state.status).toBe("running");
    });
  });

  describe("setSessionError", () => {
    it("sets error message and clears loading", () => {
      const state = setSessionError(initialState(), "Network failure");
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Network failure");
    });

    it("does not reset status by default", () => {
      let state = loadedState();
      state = { ...state, status: "running" };
      const next = setSessionError(state, "Something failed");
      expect(next.status).toBe("running");
      expect(next.error).toBe("Something failed");
    });

    it("resets status to idle when resetStatus is true", () => {
      let state = loadedState();
      state = { ...state, status: "running" };
      const next = setSessionError(state, "POST failed", true);
      expect(next.status).toBe("idle");
      expect(next.error).toBe("POST failed");
    });

    it("recovers from sendMessage failure: status returns to idle", () => {
      // Simulate: session loaded -> addUserMessage sets running -> POST fails
      let state = loadedState();
      state = addUserMessage(state, "Hello", fixedClock);
      expect(state.status).toBe("running");

      state = setSessionError(state, "Failed to send message (500)", true);
      expect(state.status).toBe("idle");
      expect(state.error).toBe("Failed to send message (500)");
    });
  });

  describe("addUserMessage", () => {
    it("appends a user message and sets status to running", () => {
      const state = loadedState();
      const next = addUserMessage(state, "Hello agent", fixedClock);

      assertSession(next);
      expect(next.session.messages).toHaveLength(1);
      expect(next.session.messages[0].role).toBe("user");
      expect(next.session.messages[0].content).toBe("Hello agent");
      expect(next.session.messages[0].timestamp).toBe(FIXED_TIMESTAMP);
      expect(next.status).toBe("running");
      expect(next.session.metadata.messageCount).toBe(1);
    });

    it("clears any existing error", () => {
      let state = loadedState();
      state = { ...state, error: "previous error" };
      const next = addUserMessage(state, "retry", fixedClock);
      expect(next.error).toBeNull();
    });

    it("returns state unchanged if no session is loaded", () => {
      const state = initialState();
      const next = addUserMessage(state, "ignored");
      expect(next).toBe(state);
    });
  });

  describe("applySSEEvent", () => {
    describe("processing event", () => {
      it("sets status to running", () => {
        const state = loadedState();
        const event: SSEEvent = { type: "processing" };
        const next = applySSEEvent(state, event);
        expect(next.status).toBe("running");
      });
    });

    describe("assistant_text event", () => {
      it("appends text to streamingText", () => {
        const state = loadedState();
        const next = applySSEEvent(state, {
          type: "assistant_text",
          text: "Hello",
        });
        expect(next.streamingText).toBe("Hello");
      });

      it("accumulates multiple text events", () => {
        let state = loadedState();
        state = applySSEEvent(state, { type: "assistant_text", text: "Hello" });
        state = applySSEEvent(state, { type: "assistant_text", text: " world" });
        expect(state.streamingText).toBe("Hello world");
      });
    });

    describe("tool_use event", () => {
      it("adds to pendingToolCalls map", () => {
        const state = loadedState();
        const event: SSEEvent = {
          type: "tool_use",
          toolName: "read_file",
          toolInput: { path: "/tmp/test.txt" },
          toolUseId: "tool-1",
        };
        const next = applySSEEvent(state, event);
        expect(next.pendingToolCalls.size).toBe(1);
        const entry = next.pendingToolCalls.get("tool-1");
        assertDefined(entry);
        expect(entry.toolName).toBe("read_file");
        expect(entry.toolInput).toEqual({ path: "/tmp/test.txt" });
        expect(entry.result).toBeUndefined();
      });
    });

    describe("tool_result event", () => {
      it("sets result on existing pending tool call", () => {
        let state = loadedState();
        state = applySSEEvent(state, {
          type: "tool_use",
          toolName: "read_file",
          toolInput: { path: "/tmp/test.txt" },
          toolUseId: "tool-1",
        });
        state = applySSEEvent(state, {
          type: "tool_result",
          toolUseId: "tool-1",
          result: { content: "file contents" },
        });

        const entry = state.pendingToolCalls.get("tool-1");
        assertDefined(entry);
        expect(entry.result).toEqual({ content: "file contents" });
      });

      it("ignores result for unknown tool call ID", () => {
        const state = loadedState();
        const next = applySSEEvent(state, {
          type: "tool_result",
          toolUseId: "unknown-id",
          result: { content: "ignored" },
        });
        expect(next.pendingToolCalls.size).toBe(0);
      });
    });

    describe("status_change event", () => {
      it("updates status", () => {
        const state = loadedState();
        const next = applySSEEvent(state, {
          type: "status_change",
          status: "expired",
        });
        expect(next.status).toBe("expired");
      });
    });

    describe("error event", () => {
      it("sets error message", () => {
        const state = loadedState();
        const next = applySSEEvent(state, {
          type: "error",
          message: "Agent crashed",
          recoverable: false,
        });
        expect(next.error).toBe("Agent crashed");
      });
    });

    describe("done event", () => {
      it("flushes streamingText as an assistant message", () => {
        let state = loadedState({ messageCount: 1 }, [makeMessage()]);
        state = applySSEEvent(state, {
          type: "assistant_text",
          text: "Response text",
        });
        state = applySSEEvent(state, { type: "done" }, fixedClock);

        expect(state.streamingText).toBe("");
        assertSession(state);
        expect(state.session.messages).toHaveLength(2);
        expect(state.session.messages[1].role).toBe("assistant");
        expect(state.session.messages[1].content).toBe("Response text");
        expect(state.session.messages[1].timestamp).toBe(FIXED_TIMESTAMP);
        expect(state.session.metadata.messageCount).toBe(2);
      });

      it("clears pendingToolCalls", () => {
        let state = loadedState();
        state = applySSEEvent(state, {
          type: "tool_use",
          toolName: "read_file",
          toolInput: {},
          toolUseId: "t-1",
        });
        state = applySSEEvent(state, { type: "done" });
        expect(state.pendingToolCalls.size).toBe(0);
      });

      it("sets status to idle", () => {
        let state = loadedState();
        state = { ...state, status: "running" };
        state = applySSEEvent(state, { type: "done" });
        expect(state.status).toBe("idle");
      });

      it("does not add empty assistant message when no streaming text", () => {
        const state = loadedState({ messageCount: 1 }, [makeMessage()]);
        const next = applySSEEvent(state, { type: "done" });
        assertSession(next);
        expect(next.session.messages).toHaveLength(1);
        expect(next.session.metadata.messageCount).toBe(1);
      });
    });
  });

  describe("full conversation flow", () => {
    it("processes a complete query cycle", () => {
      // Start with a loaded session
      let state = loadedState();

      // User sends a message
      state = addUserMessage(state, "What files are in /tmp?", fixedClock);
      assertSession(state);
      expect(state.session.messages).toHaveLength(1);
      expect(state.status).toBe("running");

      // SSE: processing
      state = applySSEEvent(state, { type: "processing" });
      expect(state.status).toBe("running");

      // SSE: status change to running
      state = applySSEEvent(state, {
        type: "status_change",
        status: "running",
      });

      // SSE: tool call
      state = applySSEEvent(state, {
        type: "tool_use",
        toolName: "list_files",
        toolInput: { path: "/tmp" },
        toolUseId: "tc-1",
      });
      expect(state.pendingToolCalls.size).toBe(1);

      // SSE: tool result
      state = applySSEEvent(state, {
        type: "tool_result",
        toolUseId: "tc-1",
        result: { files: ["a.txt", "b.txt"] },
      });
      const toolEntry = state.pendingToolCalls.get("tc-1");
      assertDefined(toolEntry);
      expect(toolEntry.result).toBeDefined();

      // SSE: assistant text
      state = applySSEEvent(state, {
        type: "assistant_text",
        text: "The files in /tmp are: ",
      });
      state = applySSEEvent(state, {
        type: "assistant_text",
        text: "a.txt and b.txt",
      });
      expect(state.streamingText).toBe(
        "The files in /tmp are: a.txt and b.txt",
      );

      // SSE: done
      state = applySSEEvent(state, { type: "done" }, fixedClock);
      expect(state.streamingText).toBe("");
      expect(state.pendingToolCalls.size).toBe(0);
      expect(state.status).toBe("idle");
      assertSession(state);
      expect(state.session.messages).toHaveLength(2);
      expect(state.session.messages[1].role).toBe("assistant");
      expect(state.session.messages[1].content).toBe(
        "The files in /tmp are: a.txt and b.txt",
      );
    });
  });
});
