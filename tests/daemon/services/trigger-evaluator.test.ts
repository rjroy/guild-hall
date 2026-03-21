import { describe, test, expect } from "bun:test";
import { expandTemplate } from "@/daemon/services/trigger-evaluator";
import type { SystemEvent } from "@/daemon/lib/event-bus";

describe("expandTemplate", () => {
  test("expands {{commissionId}} to event's commissionId", () => {
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "commission-Dalton-20260321-120000",
      status: "completed",
    };
    const result = expandTemplate("Review {{commissionId}}", event);
    expect(result).toBe("Review commission-Dalton-20260321-120000");
  });

  test("expands {{status}} to event's status", () => {
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "c1",
      status: "completed",
    };
    const result = expandTemplate("Status is {{status}}", event);
    expect(result).toBe("Status is completed");
  });

  test("expands {{nonexistent}} to empty string", () => {
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "c1",
      status: "completed",
    };
    const result = expandTemplate("Value: {{nonexistent}}", event);
    expect(result).toBe("Value: ");
  });

  test("array fields expand to comma-separated string", () => {
    const event: SystemEvent = {
      type: "commission_result",
      commissionId: "c1",
      summary: "done",
      artifacts: [".lore/specs/foo.md", ".lore/specs/bar.md"],
    };
    const result = expandTemplate("Artifacts: {{artifacts}}", event);
    expect(result).toBe("Artifacts: .lore/specs/foo.md,.lore/specs/bar.md");
  });

  test("multiple variables in one template all expand", () => {
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "c1",
      status: "completed",
    };
    const result = expandTemplate("{{commissionId}} is {{status}}", event);
    expect(result).toBe("c1 is completed");
  });

  test("template with no variables passes through unchanged", () => {
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "c1",
      status: "completed",
    };
    const result = expandTemplate("No variables here", event);
    expect(result).toBe("No variables here");
  });

  test("{{type}} expands to event type", () => {
    const event: SystemEvent = {
      type: "commission_result",
      commissionId: "c1",
      summary: "done",
    };
    const result = expandTemplate("Event type: {{type}}", event);
    expect(result).toBe("Event type: commission_result");
  });

  test("nested field name like {{foo.bar}} expands to empty string", () => {
    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "c1",
      status: "completed",
    };
    const result = expandTemplate("{{foo.bar}}", event);
    expect(result).toBe("");
  });
});
