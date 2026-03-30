import { describe, test, expect } from "bun:test";
import {
  composeMeetingPrompt,
  MEETING_GREETING_PROMPT,
} from "@/daemon/services/meeting/session-loop";

describe("composeMeetingPrompt", () => {
  test("new session with sessionContext: combines context + greeting (REQ-SPO-21)", () => {
    const result = composeMeetingPrompt("SESSION_CONTEXT", "unused", true);

    expect(result).toContain("SESSION_CONTEXT");
    expect(result).toContain(MEETING_GREETING_PROMPT);
    expect(result).toBe(`SESSION_CONTEXT\n\n${MEETING_GREETING_PROMPT}`);
  });

  test("new session without sessionContext: greeting only (REQ-SPO-21)", () => {
    const result = composeMeetingPrompt("", "unused", true);

    expect(result).toBe(MEETING_GREETING_PROMPT);
  });

  test("renewal with sessionContext: sessionContext only, no greeting (REQ-SPO-23)", () => {
    const result = composeMeetingPrompt("RENEWAL_CONTEXT", "fallback", false);

    expect(result).toBe("RENEWAL_CONTEXT");
    expect(result).not.toContain(MEETING_GREETING_PROMPT);
  });

  test("renewal without sessionContext: falls back to prompt", () => {
    const result = composeMeetingPrompt("", "FALLBACK_PROMPT", false);

    expect(result).toBe("FALLBACK_PROMPT");
  });

  test("resume path: no sessionContext, uses prompt (REQ-SPO-22)", () => {
    // Resume passes the user message as prompt with no sessionContext
    const result = composeMeetingPrompt("", "User typed this", false);

    expect(result).toBe("User typed this");
  });
});
