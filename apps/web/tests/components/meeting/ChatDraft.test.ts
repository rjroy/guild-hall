import { describe, expect, it, beforeEach } from "bun:test";
import {
  draftStorageKey,
  readDraft,
  writeDraft,
  clearDraft,
} from "@/apps/web/components/meeting/ChatInterface";

// Minimal localStorage shim for bun test environment
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
};

beforeEach(() => {
  store.clear();
});

describe("draftStorageKey", () => {
  it("returns a namespaced key including the meeting ID", () => {
    expect(draftStorageKey("mtg-abc")).toBe("guild-hall:meeting-draft:mtg-abc");
  });

  it("different meetings produce different keys", () => {
    expect(draftStorageKey("mtg-1")).not.toBe(draftStorageKey("mtg-2"));
  });
});

describe("writeDraft / readDraft", () => {
  it("saves and restores a draft", () => {
    writeDraft("mtg-1", "hello world");
    expect(readDraft("mtg-1")).toBe("hello world");
  });

  it("does not persist empty strings", () => {
    writeDraft("mtg-1", "some text");
    writeDraft("mtg-1", "");
    expect(readDraft("mtg-1")).toBe("");
    expect(store.has(draftStorageKey("mtg-1"))).toBe(false);
  });

  it("does not persist whitespace-only strings", () => {
    writeDraft("mtg-1", "some text");
    writeDraft("mtg-1", "   \t\n  ");
    expect(readDraft("mtg-1")).toBe("");
    expect(store.has(draftStorageKey("mtg-1"))).toBe(false);
  });

  it("returns empty string when no draft exists", () => {
    expect(readDraft("mtg-nonexistent")).toBe("");
  });

  it("isolates drafts by meeting ID", () => {
    writeDraft("mtg-1", "draft one");
    writeDraft("mtg-2", "draft two");
    expect(readDraft("mtg-1")).toBe("draft one");
    expect(readDraft("mtg-2")).toBe("draft two");
  });
});

describe("clearDraft", () => {
  it("removes the stored draft", () => {
    writeDraft("mtg-1", "will be cleared");
    clearDraft("mtg-1");
    expect(readDraft("mtg-1")).toBe("");
    expect(store.has(draftStorageKey("mtg-1"))).toBe(false);
  });

  it("is a no-op when no draft exists", () => {
    clearDraft("mtg-nonexistent");
    expect(store.size).toBe(0);
  });
});

describe("draft lifecycle (simulated component behavior)", () => {
  it("persists on change, restores on mount, clears on send", () => {
    // User types (onChange fires writeDraft)
    writeDraft("mtg-session", "my draft message");

    // User navigates away, comes back (mount reads draft)
    const restored = readDraft("mtg-session");
    expect(restored).toBe("my draft message");

    // User sends (handleSend clears input, writeDraft("") removes key)
    writeDraft("mtg-session", "");
    expect(readDraft("mtg-session")).toBe("");
    expect(store.has(draftStorageKey("mtg-session"))).toBe(false);
  });
});
