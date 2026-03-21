import type { ContextTypeRegistry } from "./toolbox-types";
import { meetingToolboxFactory } from "./meeting/toolbox";
import { commissionToolboxFactory } from "./commission/toolbox";
import { mailToolboxFactory } from "./mail/toolbox";

export type ContextTypeName = "meeting" | "commission" | "mail" | "briefing";

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
  registry.set("mail", {
    name: "mail",
    toolboxFactory: mailToolboxFactory,
    stateSubdir: "commissions",
  });
  registry.set("briefing", {
    name: "briefing",
    stateSubdir: "briefings",
  });
  return registry;
}
