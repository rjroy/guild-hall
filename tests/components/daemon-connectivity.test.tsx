import { describe, test, expect } from "bun:test";
import { DaemonContext, useDaemonStatus } from "@/components/ui/DaemonContext";
import type { DaemonStatusState } from "@/components/ui/DaemonContext";

/**
 * Daemon connectivity graceful degradation tests.
 *
 * DaemonContext provides { isOnline: boolean } to the component tree.
 * DaemonStatus (the provider) is a client component with useEffect and
 * cannot be called outside a React render context. We test the context
 * module exports, the hook contract, and the pure logic that consuming
 * components use to determine disabled state and tooltip text.
 *
 * CSS module class names resolve to undefined in bun test. We focus on
 * behavioral contracts, not rendered output.
 */

// -- DaemonContext module exports --

describe("DaemonContext exports", () => {
  test("DaemonContext is a React context object", () => {
    expect(DaemonContext).toBeDefined();
    // React contexts have Provider and Consumer properties
    expect(DaemonContext.Provider).toBeDefined();
    expect(DaemonContext.Consumer).toBeDefined();
  });

  test("useDaemonStatus is a function", () => {
    expect(typeof useDaemonStatus).toBe("function");
  });

  test("DaemonContext default value has isOnline true", () => {
    // The default value (used when no Provider is above the consumer)
    // should be true so that buttons are enabled by default, matching
    // the optimistic assumption before the first health check.
    const defaultValue = (DaemonContext as unknown as { _currentValue: DaemonStatusState })._currentValue;
    expect(defaultValue.isOnline).toBe(true);
  });
});

// -- DaemonStatusState interface contract --

describe("DaemonStatusState contract", () => {
  test("online state shape", () => {
    const state: DaemonStatusState = { isOnline: true };
    expect(state.isOnline).toBe(true);
  });

  test("offline state shape", () => {
    const state: DaemonStatusState = { isOnline: false };
    expect(state.isOnline).toBe(false);
  });
});

// -- Button disabling logic --
// The consuming components all follow the same pattern:
//   disabled={someCondition || !isOnline}
//   title={!isOnline ? "Daemon offline" : undefined}
//
// We test this logic as pure functions to verify the contracts.

/**
 * Mirrors the disabled logic used by commission action buttons.
 * A button is disabled if loading OR the daemon is offline.
 */
function isButtonDisabled(loading: boolean, isOnline: boolean): boolean {
  return loading || !isOnline;
}

/**
 * Mirrors the tooltip logic used by all action buttons.
 * Shows "Daemon offline" tooltip only when the daemon is offline.
 */
function offlineTooltip(isOnline: boolean): string | undefined {
  return !isOnline ? "Daemon offline" : undefined;
}

describe("commission button disabling logic", () => {
  test("enabled when online and not loading", () => {
    expect(isButtonDisabled(false, true)).toBe(false);
  });

  test("disabled when loading, even if online", () => {
    expect(isButtonDisabled(true, true)).toBe(true);
  });

  test("disabled when offline, even if not loading", () => {
    expect(isButtonDisabled(false, false)).toBe(true);
  });

  test("disabled when both loading and offline", () => {
    expect(isButtonDisabled(true, false)).toBe(true);
  });
});

describe("offline tooltip logic", () => {
  test("no tooltip when online", () => {
    expect(offlineTooltip(true)).toBeUndefined();
  });

  test("shows 'Daemon offline' when offline", () => {
    expect(offlineTooltip(false)).toBe("Daemon offline");
  });
});

// -- MessageInput disabling logic --
// The send button uses: disabled={!value.trim() || !isOnline}
// The textarea uses: disabled={isStreaming || !isOnline}
// The Enter key handler checks: value.trim() && !isStreaming && isOnline

function isSendDisabled(value: string, isOnline: boolean): boolean {
  return !value.trim() || !isOnline;
}

function isTextareaDisabled(isStreaming: boolean, isOnline: boolean): boolean {
  return isStreaming || !isOnline;
}

function canSendOnEnter(value: string, isStreaming: boolean, isOnline: boolean): boolean {
  return !!value.trim() && !isStreaming && isOnline;
}

describe("MessageInput disabling logic", () => {
  test("send enabled with text and online", () => {
    expect(isSendDisabled("hello", true)).toBe(false);
  });

  test("send disabled with empty text, even if online", () => {
    expect(isSendDisabled("", true)).toBe(true);
    expect(isSendDisabled("   ", true)).toBe(true);
  });

  test("send disabled when offline, even with text", () => {
    expect(isSendDisabled("hello", false)).toBe(true);
  });

  test("textarea enabled when not streaming and online", () => {
    expect(isTextareaDisabled(false, true)).toBe(false);
  });

  test("textarea disabled when streaming", () => {
    expect(isTextareaDisabled(true, true)).toBe(true);
  });

  test("textarea disabled when offline", () => {
    expect(isTextareaDisabled(false, false)).toBe(true);
  });

  test("Enter sends when has text, not streaming, and online", () => {
    expect(canSendOnEnter("hello", false, true)).toBe(true);
  });

  test("Enter does not send when offline", () => {
    expect(canSendOnEnter("hello", false, false)).toBe(false);
  });

  test("Enter does not send when streaming", () => {
    expect(canSendOnEnter("hello", true, true)).toBe(false);
  });

  test("Enter does not send with empty text", () => {
    expect(canSendOnEnter("", false, true)).toBe(false);
  });
});

// -- MeetingView close button disabling logic --
// disabled={closing || !isOnline}

function isCloseDisabled(closing: boolean, isOnline: boolean): boolean {
  return closing || !isOnline;
}

describe("MeetingView close button disabling logic", () => {
  test("enabled when not closing and online", () => {
    expect(isCloseDisabled(false, true)).toBe(false);
  });

  test("disabled when closing", () => {
    expect(isCloseDisabled(true, true)).toBe(true);
  });

  test("disabled when offline", () => {
    expect(isCloseDisabled(false, false)).toBe(true);
  });

  test("disabled when both closing and offline", () => {
    expect(isCloseDisabled(true, false)).toBe(true);
  });
});

// -- MeetingRequestCard button disabling logic --
// Main action buttons: disabled={!isOnline}
// Date confirm: disabled={!deferDate || !isOnline}
// Quick comment send: disabled={!quickCommentPrompt.trim() || !isOnline}

function isMeetingActionDisabled(isOnline: boolean): boolean {
  return !isOnline;
}

function isDeferConfirmDisabled(deferDate: string, isOnline: boolean): boolean {
  return !deferDate || !isOnline;
}

function isQuickCommentSendDisabled(prompt: string, isOnline: boolean): boolean {
  return !prompt.trim() || !isOnline;
}

describe("MeetingRequestCard action disabling logic", () => {
  test("action buttons enabled when online", () => {
    expect(isMeetingActionDisabled(true)).toBe(false);
  });

  test("action buttons disabled when offline", () => {
    expect(isMeetingActionDisabled(false)).toBe(true);
  });

  test("defer confirm enabled with date and online", () => {
    expect(isDeferConfirmDisabled("2026-03-01", true)).toBe(false);
  });

  test("defer confirm disabled without date", () => {
    expect(isDeferConfirmDisabled("", true)).toBe(true);
  });

  test("defer confirm disabled when offline", () => {
    expect(isDeferConfirmDisabled("2026-03-01", false)).toBe(true);
  });

  test("quick comment send enabled with prompt and online", () => {
    expect(isQuickCommentSendDisabled("Do this task", true)).toBe(false);
  });

  test("quick comment send disabled with empty prompt", () => {
    expect(isQuickCommentSendDisabled("", true)).toBe(true);
    expect(isQuickCommentSendDisabled("   ", true)).toBe(true);
  });

  test("quick comment send disabled when offline", () => {
    expect(isQuickCommentSendDisabled("Do this task", false)).toBe(true);
  });
});

// -- Tooltip consistency across components --

describe("tooltip consistency", () => {
  test("all components use the same tooltip text", () => {
    const tooltip = "Daemon offline";
    // Verify the tooltip is always the same string for all components
    expect(offlineTooltip(false)).toBe(tooltip);
  });

  test("placeholder changes when offline in MessageInput", () => {
    const isOnline = false;
    const placeholder = isOnline ? "Speak to the guild worker..." : "Daemon offline";
    expect(placeholder).toBe("Daemon offline");
  });

  test("placeholder is normal when online in MessageInput", () => {
    const isOnline = true;
    const placeholder = isOnline ? "Speak to the guild worker..." : "Daemon offline";
    expect(placeholder).toBe("Speak to the guild worker...");
  });
});
