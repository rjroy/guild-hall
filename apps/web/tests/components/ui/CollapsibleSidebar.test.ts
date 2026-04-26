import { describe, expect, it, beforeEach } from "bun:test";
import {
  readCollapsed,
  writeCollapsed,
} from "@/apps/web/components/ui/CollapsibleSidebar";

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

describe("readCollapsed", () => {
  it("returns false when no value is stored", () => {
    expect(readCollapsed("sidebar-collapsed:test")).toBe(false);
  });

  it("returns true when stored value is 'true'", () => {
    store.set("sidebar-collapsed:test", "true");
    expect(readCollapsed("sidebar-collapsed:test")).toBe(true);
  });

  it("returns false when stored value is 'false'", () => {
    store.set("sidebar-collapsed:test", "false");
    expect(readCollapsed("sidebar-collapsed:test")).toBe(false);
  });

  it("returns false for unexpected stored values", () => {
    store.set("sidebar-collapsed:test", "yes");
    expect(readCollapsed("sidebar-collapsed:test")).toBe(false);
  });

  it("uses distinct keys for different views", () => {
    store.set("sidebar-collapsed:artifact", "true");
    store.set("sidebar-collapsed:meeting", "false");
    expect(readCollapsed("sidebar-collapsed:artifact")).toBe(true);
    expect(readCollapsed("sidebar-collapsed:meeting")).toBe(false);
  });
});

describe("writeCollapsed", () => {
  it("writes 'true' to localStorage when collapsed", () => {
    writeCollapsed("sidebar-collapsed:test", true);
    expect(store.get("sidebar-collapsed:test")).toBe("true");
  });

  it("writes 'false' to localStorage when expanded", () => {
    writeCollapsed("sidebar-collapsed:test", false);
    expect(store.get("sidebar-collapsed:test")).toBe("false");
  });

  it("overwrites previous value", () => {
    writeCollapsed("sidebar-collapsed:test", true);
    writeCollapsed("sidebar-collapsed:test", false);
    expect(store.get("sidebar-collapsed:test")).toBe("false");
  });

  it("does not affect other keys", () => {
    writeCollapsed("sidebar-collapsed:artifact", true);
    writeCollapsed("sidebar-collapsed:meeting", false);
    expect(store.get("sidebar-collapsed:artifact")).toBe("true");
    expect(store.get("sidebar-collapsed:meeting")).toBe("false");
  });
});

describe("readCollapsed + writeCollapsed roundtrip", () => {
  it("read reflects what was written", () => {
    writeCollapsed("sidebar-collapsed:rt", true);
    expect(readCollapsed("sidebar-collapsed:rt")).toBe(true);

    writeCollapsed("sidebar-collapsed:rt", false);
    expect(readCollapsed("sidebar-collapsed:rt")).toBe(false);
  });
});
