import { describe, expect, it } from "bun:test";

import type { SessionStatus, StoredMessage } from "@/lib/types";
import type { ToolCallEntry } from "@/lib/workshop-state";
import {
  getMessageAlignment,
  getSSEUrl,
  isConversationEmpty,
  isInputDisabled,
  isProcessing,
  isSessionExpired,
  shouldSubmitOnKey,
} from "@/lib/workshop-utils";

// -- Fixtures --

function makeStoredMessage(
  overrides: Partial<StoredMessage> = {},
): StoredMessage {
  return {
    role: "user",
    content: "Hello",
    timestamp: "2026-02-12T12:00:00.000Z",
    ...overrides,
  };
}

function makeToolCallEntry(
  overrides: Partial<ToolCallEntry> = {},
): ToolCallEntry {
  return {
    toolName: "read_file",
    toolInput: { path: "/tmp/test.txt" },
    ...overrides,
  };
}

// -- Tests --

describe("isConversationEmpty", () => {
  it("returns true when messages, streamingText, and pendingToolCalls are all empty", () => {
    expect(
      isConversationEmpty([], "", new Map<string, ToolCallEntry>()),
    ).toBe(true);
  });

  it("returns false when messages exist", () => {
    expect(
      isConversationEmpty([makeStoredMessage()], "", new Map()),
    ).toBe(false);
  });

  it("returns false when streaming text exists", () => {
    expect(
      isConversationEmpty([], "partial response", new Map()),
    ).toBe(false);
  });

  it("returns false when pending tool calls exist", () => {
    const pending = new Map<string, ToolCallEntry>();
    pending.set("t-1", makeToolCallEntry());
    expect(isConversationEmpty([], "", pending)).toBe(false);
  });
});

describe("getMessageAlignment", () => {
  it("returns right for user messages", () => {
    expect(getMessageAlignment("user")).toBe("right");
  });

  it("returns left for assistant messages", () => {
    expect(getMessageAlignment("assistant")).toBe("left");
  });
});

describe("ToolCallDisplay logic", () => {
  describe("pending vs completed state", () => {
    it("pending when result is undefined", () => {
      const entry = makeToolCallEntry();
      expect(entry.result === undefined).toBe(true);
    });

    it("completed when result is defined", () => {
      const entry = makeToolCallEntry({ result: { data: "contents" } });
      expect(entry.result === undefined).toBe(false);
    });

    it("completed even when result is null", () => {
      const entry = makeToolCallEntry({ result: null });
      expect(entry.result === undefined).toBe(false);
    });

    it("completed even when result is empty object", () => {
      const entry = makeToolCallEntry({ result: {} });
      expect(entry.result === undefined).toBe(false);
    });
  });

  describe("JSON formatting", () => {
    it("formats tool input as pretty JSON", () => {
      const input = { path: "/tmp/test.txt", encoding: "utf-8" };
      const formatted = JSON.stringify(input, null, 2);
      expect(formatted).toContain('"path": "/tmp/test.txt"');
      expect(formatted).toContain('"encoding": "utf-8"');
    });

    it("formats tool result as pretty JSON", () => {
      const result = { content: "file data", size: 42 };
      const formatted = JSON.stringify(result, null, 2);
      expect(formatted).toContain('"content": "file data"');
      expect(formatted).toContain('"size": 42');
    });

    it("handles nested objects in tool input", () => {
      const input = { filters: { type: "file", pattern: "*.ts" } };
      const formatted = JSON.stringify(input, null, 2);
      expect(formatted).toContain('"type": "file"');
    });
  });
});

describe("isInputDisabled", () => {
  it("is disabled when status is running", () => {
    expect(isInputDisabled("running")).toBe(true);
  });

  it("is enabled when status is idle", () => {
    expect(isInputDisabled("idle")).toBe(false);
  });

  it("is enabled when status is completed", () => {
    expect(isInputDisabled("completed")).toBe(false);
  });
});

describe("shouldSubmitOnKey", () => {
  it("Enter without shift triggers submit", () => {
    expect(shouldSubmitOnKey("Enter", false)).toBe(true);
  });

  it("Shift+Enter does not trigger submit", () => {
    expect(shouldSubmitOnKey("Enter", true)).toBe(false);
  });

  it("other keys do not trigger submit", () => {
    expect(shouldSubmitOnKey("a", false)).toBe(false);
  });
});

describe("isProcessing", () => {
  it("returns true when status is running", () => {
    expect(isProcessing("running")).toBe(true);
  });

  it("returns false when status is idle", () => {
    expect(isProcessing("idle")).toBe(false);
  });
});

describe("getSSEUrl", () => {
  it("returns event URL when status is running", () => {
    expect(getSSEUrl("running", "session-1")).toBe(
      "/api/sessions/session-1/events",
    );
  });

  it("returns null when status is idle", () => {
    expect(getSSEUrl("idle", "session-1")).toBeNull();
  });

  it("returns null when status is expired", () => {
    expect(getSSEUrl("expired", "session-1")).toBeNull();
  });
});

describe("isSessionExpired", () => {
  it("returns true when status is expired", () => {
    expect(isSessionExpired("expired")).toBe(true);
  });

  it("returns false for other statuses", () => {
    const statuses: SessionStatus[] = [
      "idle",
      "running",
      "completed",
      "error",
    ];
    for (const status of statuses) {
      expect(isSessionExpired(status)).toBe(false);
    }
  });
});

describe("WorkshopView error state determination", () => {
  it("shows full-page error when error exists and no session", () => {
    const error: string | null = "Session not found";
    const session = null;
    const showFullError = error !== null && session === null;
    expect(showFullError).toBe(true);
  });

  it("shows inline error when error exists with session", () => {
    const error: string | null = "Failed to send";
    const session = { metadata: {}, messages: [] };
    const showFullError = error !== null && session === null;
    const showInlineError = error !== null && session !== null;
    expect(showFullError).toBe(false);
    expect(showInlineError).toBe(true);
  });

  it("shows no error when error is null", () => {
    const error: string | null = null;
    expect(error !== null).toBe(false);
  });
});
