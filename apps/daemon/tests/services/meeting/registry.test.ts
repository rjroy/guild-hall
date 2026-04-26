import { describe, it, expect, beforeEach } from "bun:test";
import { MeetingRegistry } from "@/apps/daemon/services/meeting/registry";
import type { ActiveMeetingEntry } from "@/apps/daemon/services/meeting/registry";
import { asMeetingId, asSdkSessionId } from "@/apps/daemon/types";


function makeEntry(overrides: Partial<ActiveMeetingEntry> = {}): ActiveMeetingEntry {
  return {
    meetingId: asMeetingId("mtg-default"),
    projectName: "test-project",
    workerName: "test-worker",
    packageName: "test-assistant",
    sdkSessionId: asSdkSessionId("sdk-1"),
    worktreeDir: "/tmp/worktree",
    branchName: "meeting/mtg-default",
    abortController: new AbortController(),
    status: "open",
    scope: "activity",
    ...overrides,
  };
}

describe("MeetingRegistry", () => {
  let registry: MeetingRegistry;

  beforeEach(() => {
    registry = new MeetingRegistry();
  });

  describe("register", () => {
    it("stores an entry that can be retrieved", () => {
      const id = asMeetingId("mtg-1");
      const entry = makeEntry({ meetingId: id });

      registry.register(id, entry);

      expect(registry.get(id)).toBe(entry);
    });

    it("throws on duplicate ID", () => {
      const id = asMeetingId("mtg-dup");
      const entry = makeEntry({ meetingId: id });

      registry.register(id, entry);

      expect(() => registry.register(id, entry)).toThrow(
        'Meeting "mtg-dup" is already registered',
      );
    });
  });

  describe("deregister", () => {
    it("removes a registered entry", () => {
      const id = asMeetingId("mtg-2");
      registry.register(id, makeEntry({ meetingId: id }));

      registry.deregister(id);

      expect(registry.has(id)).toBe(false);
      expect(registry.get(id)).toBeUndefined();
    });

    it("is idempotent (no error on double-deregister)", () => {
      const id = asMeetingId("mtg-3");
      registry.register(id, makeEntry({ meetingId: id }));

      registry.deregister(id);
      // Second call should not throw
      expect(() => registry.deregister(id)).not.toThrow();
    });

    it("clears any close-in-progress flag", () => {
      const id = asMeetingId("mtg-close-clear");
      registry.register(id, makeEntry({ meetingId: id }));

      // Acquire close guard
      expect(registry.acquireClose(id)).toBe(true);

      // Deregister clears the flag
      registry.deregister(id);

      // Re-register and acquireClose should succeed (flag was cleared)
      registry.register(id, makeEntry({ meetingId: id }));
      expect(registry.acquireClose(id)).toBe(true);
    });
  });

  describe("get", () => {
    it("returns the entry for a registered ID", () => {
      const id = asMeetingId("mtg-get");
      const entry = makeEntry({ meetingId: id });
      registry.register(id, entry);

      expect(registry.get(id)).toBe(entry);
    });

    it("returns undefined for an unregistered ID", () => {
      expect(registry.get(asMeetingId("nonexistent"))).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for a registered ID", () => {
      const id = asMeetingId("mtg-has");
      registry.register(id, makeEntry({ meetingId: id }));

      expect(registry.has(id)).toBe(true);
    });

    it("returns false for an unregistered ID", () => {
      expect(registry.has(asMeetingId("nope"))).toBe(false);
    });
  });

  describe("countForProject", () => {
    it("counts only entries matching the specified project", () => {
      registry.register(
        asMeetingId("mtg-a1"),
        makeEntry({ meetingId: asMeetingId("mtg-a1"), projectName: "alpha" }),
      );
      registry.register(
        asMeetingId("mtg-a2"),
        makeEntry({ meetingId: asMeetingId("mtg-a2"), projectName: "alpha" }),
      );
      registry.register(
        asMeetingId("mtg-b1"),
        makeEntry({ meetingId: asMeetingId("mtg-b1"), projectName: "beta" }),
      );

      expect(registry.countForProject("alpha")).toBe(2);
      expect(registry.countForProject("beta")).toBe(1);
      expect(registry.countForProject("gamma")).toBe(0);
    });

    it("returns 0 when registry is empty", () => {
      expect(registry.countForProject("anything")).toBe(0);
    });
  });

  describe("listForProject", () => {
    it("returns entries only for the specified project", () => {
      const a1 = makeEntry({ meetingId: asMeetingId("mtg-a1"), projectName: "alpha" });
      const a2 = makeEntry({ meetingId: asMeetingId("mtg-a2"), projectName: "alpha" });
      const b1 = makeEntry({ meetingId: asMeetingId("mtg-b1"), projectName: "beta" });

      registry.register(asMeetingId("mtg-a1"), a1);
      registry.register(asMeetingId("mtg-a2"), a2);
      registry.register(asMeetingId("mtg-b1"), b1);

      const alphaList = registry.listForProject("alpha");
      expect(alphaList).toHaveLength(2);
      expect(alphaList).toContain(a1);
      expect(alphaList).toContain(a2);

      const betaList = registry.listForProject("beta");
      expect(betaList).toHaveLength(1);
      expect(betaList).toContain(b1);
    });

    it("returns empty array for unknown project", () => {
      expect(registry.listForProject("nope")).toEqual([]);
    });
  });

  describe("acquireClose", () => {
    it("returns true on first call for a registered ID", () => {
      const id = asMeetingId("mtg-close-1");
      registry.register(id, makeEntry({ meetingId: id }));

      expect(registry.acquireClose(id)).toBe(true);
    });

    it("returns false on second call for the same ID", () => {
      const id = asMeetingId("mtg-close-2");
      registry.register(id, makeEntry({ meetingId: id }));

      expect(registry.acquireClose(id)).toBe(true);
      expect(registry.acquireClose(id)).toBe(false);
    });

    it("throws for an unregistered ID", () => {
      const id = asMeetingId("mtg-close-unregistered");

      expect(() => registry.acquireClose(id)).toThrow(
        'Cannot acquire close guard for unregistered meeting "mtg-close-unregistered"',
      );
    });
  });

  describe("releaseClose", () => {
    it("clears flag so subsequent acquireClose succeeds", () => {
      const id = asMeetingId("mtg-release");
      registry.register(id, makeEntry({ meetingId: id }));

      registry.acquireClose(id);
      registry.releaseClose(id);

      expect(registry.acquireClose(id)).toBe(true);
    });

    it("is safe to call when no close is in progress", () => {
      const id = asMeetingId("mtg-release-noop");
      // Should not throw
      expect(() => registry.releaseClose(id)).not.toThrow();
    });
  });

  describe("register id-key consistency", () => {
    it("throws when entry meetingId does not match registry key", () => {
      const key = asMeetingId("mtg-key");
      const entry = makeEntry({ meetingId: asMeetingId("mtg-different") });

      expect(() => registry.register(key, entry)).toThrow(
        'Entry meetingId "mtg-different" does not match registry key "mtg-key"',
      );
    });
  });

  describe("size", () => {
    it("returns 0 for an empty registry", () => {
      expect(registry.size).toBe(0);
    });

    it("increases after register and decreases after deregister", () => {
      const id1 = asMeetingId("mtg-size-1");
      const id2 = asMeetingId("mtg-size-2");

      registry.register(id1, makeEntry({ meetingId: id1 }));
      expect(registry.size).toBe(1);

      registry.register(id2, makeEntry({ meetingId: id2 }));
      expect(registry.size).toBe(2);

      registry.deregister(id1);
      expect(registry.size).toBe(1);

      registry.deregister(id2);
      expect(registry.size).toBe(0);
    });
  });
});
