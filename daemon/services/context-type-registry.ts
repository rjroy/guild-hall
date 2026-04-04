import type { ContextTypeRegistry } from "./toolbox-types";
import { meetingToolboxFactory } from "./meeting/toolbox";
import { commissionToolboxFactory } from "./commission/toolbox";

export type ContextTypeName = "meeting" | "commission" | "briefing" | "subagent" | "heartbeat";

export function createContextTypeRegistry(): ContextTypeRegistry {
  const registry: ContextTypeRegistry = new Map();
  registry.set("meeting", {
    name: "meeting",
    toolboxFactory: meetingToolboxFactory,
    stateSubdir: "meetings",
  });
  registry.set("commission", {
    name: "commission",
    toolboxFactory: commissionToolboxFactory,
    stateSubdir: "commissions",
  });
  registry.set("briefing", {
    name: "briefing",
    stateSubdir: "briefings",
  });
  registry.set("subagent", {
    name: "subagent",
    stateSubdir: "subagents",
  });
  registry.set("heartbeat", {
    name: "heartbeat",
    stateSubdir: "heartbeats",
  });
  return registry;
}
