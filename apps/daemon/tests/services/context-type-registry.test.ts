import { describe, test, expect } from "bun:test";
import { createContextTypeRegistry } from "@/apps/daemon/services/context-type-registry";

describe("createContextTypeRegistry", () => {
  test("returns a Map with 5 entries", () => {
    const registry = createContextTypeRegistry();
    expect(registry.size).toBe(5);
    expect(registry.has("meeting")).toBe(true);
    expect(registry.has("commission")).toBe(true);
    expect(registry.has("briefing")).toBe(true);
    expect(registry.has("subagent")).toBe(true);
    expect(registry.has("heartbeat")).toBe(true);
  });

  test("meeting entry has toolboxFactory and stateSubdir 'meetings'", () => {
    const registry = createContextTypeRegistry();
    const meeting = registry.get("meeting")!;
    expect(meeting.name).toBe("meeting");
    expect(meeting.toolboxFactory).toBeDefined();
    expect(typeof meeting.toolboxFactory).toBe("function");
    expect(meeting.stateSubdir).toBe("meetings");
  });

  test("commission entry has toolboxFactory and stateSubdir 'commissions'", () => {
    const registry = createContextTypeRegistry();
    const commission = registry.get("commission")!;
    expect(commission.name).toBe("commission");
    expect(commission.toolboxFactory).toBeDefined();
    expect(typeof commission.toolboxFactory).toBe("function");
    expect(commission.stateSubdir).toBe("commissions");
  });

  test("briefing entry has no toolboxFactory and stateSubdir 'briefings'", () => {
    const registry = createContextTypeRegistry();
    const briefing = registry.get("briefing")!;
    expect(briefing.name).toBe("briefing");
    expect(briefing.toolboxFactory).toBeUndefined();
    expect(briefing.stateSubdir).toBe("briefings");
  });

  test("subagent entry has no toolboxFactory and stateSubdir 'subagents'", () => {
    const registry = createContextTypeRegistry();
    const subagent = registry.get("subagent")!;
    expect(subagent.name).toBe("subagent");
    expect(subagent.toolboxFactory).toBeUndefined();
    expect(subagent.stateSubdir).toBe("subagents");
  });

  test("heartbeat entry has no toolboxFactory and stateSubdir 'heartbeats'", () => {
    const registry = createContextTypeRegistry();
    const heartbeat = registry.get("heartbeat")!;
    expect(heartbeat.name).toBe("heartbeat");
    expect(heartbeat.toolboxFactory).toBeUndefined();
    expect(heartbeat.stateSubdir).toBe("heartbeats");
  });

  test("each call returns a fresh instance", () => {
    const a = createContextTypeRegistry();
    const b = createContextTypeRegistry();
    expect(a).not.toBe(b);
  });
});
