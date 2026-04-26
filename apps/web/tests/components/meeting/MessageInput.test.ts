import { describe, expect, it } from "bun:test";
import {
  shouldSendOnEnter,
  isTextareaDisabled,
} from "@/apps/web/components/meeting/MessageInput";

const base = {
  value: "hello",
  isStreaming: false,
  isOnline: true,
  shiftKey: false,
  isTouchDevice: false,
};

describe("shouldSendOnEnter", () => {
  it("returns true when not streaming, online, has value, desktop, no shift", () => {
    expect(shouldSendOnEnter(base)).toBe(true);
  });

  it("returns false during streaming (Enter inserts newline)", () => {
    expect(shouldSendOnEnter({ ...base, isStreaming: true })).toBe(false);
  });

  it("returns false when offline", () => {
    expect(shouldSendOnEnter({ ...base, isOnline: false })).toBe(false);
  });

  it("returns false when value is empty", () => {
    expect(shouldSendOnEnter({ ...base, value: "" })).toBe(false);
  });

  it("returns false when value is whitespace-only", () => {
    expect(shouldSendOnEnter({ ...base, value: "   " })).toBe(false);
  });

  it("returns false when shift key is held (shift+enter = newline)", () => {
    expect(shouldSendOnEnter({ ...base, shiftKey: true })).toBe(false);
  });

  it("returns false on touch devices (enter = newline on mobile)", () => {
    expect(shouldSendOnEnter({ ...base, isTouchDevice: true })).toBe(false);
  });

  it("returns false when streaming even with valid value and online", () => {
    expect(
      shouldSendOnEnter({
        value: "a message",
        isStreaming: true,
        isOnline: true,
        shiftKey: false,
        isTouchDevice: false,
      }),
    ).toBe(false);
  });
});

describe("isTextareaDisabled", () => {
  it("returns false when online (textarea enabled)", () => {
    expect(isTextareaDisabled({ isOnline: true })).toBe(false);
  });

  it("returns true when offline (textarea disabled)", () => {
    expect(isTextareaDisabled({ isOnline: false })).toBe(true);
  });
});
