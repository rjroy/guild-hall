import { describe, test, expect } from "bun:test";
import {
  getCommissionFormatter,
  isCommissionAction,
} from "@/cli/commission-format";
import { CLI_SURFACE, type CliNode } from "@/cli/surface";

function collectOperationIds(node: CliNode): string[] {
  if (node.kind === "leaf") return [node.operationId];
  return node.children.flatMap(collectOperationIds);
}

describe("REQ-CLI-AGENT-25: commission continue/save are fully removed", () => {
  test("getCommissionFormatter returns undefined for commission.run.continue", () => {
    expect(getCommissionFormatter("commission.run.continue")).toBeUndefined();
  });

  test("getCommissionFormatter returns undefined for commission.run.save", () => {
    expect(getCommissionFormatter("commission.run.save")).toBeUndefined();
  });

  test("isCommissionAction returns false for commission.run.continue", () => {
    expect(isCommissionAction("commission.run.continue")).toBe(false);
  });

  test("isCommissionAction returns false for commission.run.save", () => {
    expect(isCommissionAction("commission.run.save")).toBe(false);
  });

  test("commission.run.continue is not reachable from the CLI surface", () => {
    const allOps = collectOperationIds(CLI_SURFACE);
    expect(allOps).not.toContain("commission.run.continue");
  });

  test("commission.run.save is not reachable from the CLI surface", () => {
    const allOps = collectOperationIds(CLI_SURFACE);
    expect(allOps).not.toContain("commission.run.save");
  });

  test("no CLI segment named 'continue' under the commission group", () => {
    const commission = CLI_SURFACE.children.find(
      (c) => c.kind === "group" && c.name === "commission",
    );
    if (!commission || commission.kind !== "group") {
      throw new Error("commission group missing");
    }
    const names = commission.children.map((c) => c.name);
    expect(names).not.toContain("continue");
    expect(names).not.toContain("save");
  });
});
