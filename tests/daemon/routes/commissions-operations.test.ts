import { describe, test, expect } from "bun:test";
import { createCommissionRoutes } from "@/daemon/routes/commissions";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { OperationDefinition, OperationParameter } from "@/lib/types";

// Minimal mock session (only operations metadata is tested, no routes are called)
const stubSession = {
  createCommission: () => Promise.resolve({ commissionId: "" }),
  updateCommission: () => Promise.resolve(),
  dispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
  cancelCommission: () => Promise.resolve(),
  abandonCommission: () => Promise.resolve(),
  redispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
  addUserNote: () => Promise.resolve(),
  checkDependencyTransitions: () => Promise.resolve(),
  recoverCommissions: () => Promise.resolve(0),
  getActiveCommissions: () => 0,
  createScheduledCommission: () => Promise.resolve({ commissionId: "" }),
  createTriggeredCommission: () => Promise.resolve({ commissionId: "" }),
  updateScheduleStatus: () => Promise.resolve({ outcome: "executed" as const, status: "" }),
  updateTriggerStatus: () => Promise.resolve({ commissionId: "", status: "" }),
  shutdown: () => {},
} as CommissionSessionForRoutes;

const { operations } = createCommissionRoutes({ commissionSession: stubSession });

function findOp(operationId: string): OperationDefinition {
  const op = operations.find((o) => o.operationId === operationId);
  if (!op) throw new Error(`Operation not found: ${operationId}`);
  return op;
}

function paramNames(params: OperationParameter[]): string[] {
  return params.map((p) => p.name);
}

describe("commission operation parameter completeness", () => {
  test("create has projectName, workerName, title, prompt (all required, body)", () => {
    const op = findOp("commission.request.commission.create");
    expect(paramNames(op.parameters!)).toEqual(["projectName", "workerName", "title", "prompt"]);
    for (const p of op.parameters!) {
      expect(p.required).toBe(true);
      expect(p.in).toBe("body");
    }
  });

  test("note has commissionId and content (both required, body)", () => {
    const op = findOp("commission.request.commission.note");
    expect(paramNames(op.parameters!)).toEqual(["commissionId", "content"]);
    for (const p of op.parameters!) {
      expect(p.required).toBe(true);
      expect(p.in).toBe("body");
    }
  });

  test("abandon has commissionId and reason (both required, body)", () => {
    const op = findOp("commission.run.abandon");
    expect(paramNames(op.parameters!)).toEqual(["commissionId", "reason"]);
    for (const p of op.parameters!) {
      expect(p.required).toBe(true);
      expect(p.in).toBe("body");
    }
  });

  test("schedule update has commissionId and status (both required, body)", () => {
    const op = findOp("commission.schedule.commission.update");
    expect(paramNames(op.parameters!)).toEqual(["commissionId", "status"]);
    for (const p of op.parameters!) {
      expect(p.required).toBe(true);
      expect(p.in).toBe("body");
    }
  });

  test("trigger update has commissionId (required), status (required), projectName (optional)", () => {
    const op = findOp("commission.trigger.commission.update");
    expect(paramNames(op.parameters!)).toEqual(["commissionId", "status", "projectName"]);
    expect(op.parameters![0]).toMatchObject({ name: "commissionId", required: true, in: "body" });
    expect(op.parameters![1]).toMatchObject({ name: "status", required: true, in: "body" });
    expect(op.parameters![2]).toMatchObject({ name: "projectName", required: false, in: "body" });
  });

  test("list has projectName (required), status (optional), worker (optional) as query params", () => {
    const op = findOp("commission.request.commission.list");
    expect(paramNames(op.parameters!)).toEqual(["projectName", "status", "worker"]);
    expect(op.parameters![0]).toMatchObject({ name: "projectName", required: true, in: "query" });
    expect(op.parameters![1]).toMatchObject({ name: "status", required: false, in: "query" });
    expect(op.parameters![2]).toMatchObject({ name: "worker", required: false, in: "query" });
  });

  test("update has only commissionId (no missing params)", () => {
    const op = findOp("commission.request.commission.update");
    expect(paramNames(op.parameters!)).toEqual(["commissionId"]);
  });
});

describe("commission operation parameter order matches command phrasing (REQ-CLI-COM-2)", () => {
  test("create: projectName workerName title prompt", () => {
    const op = findOp("commission.request.commission.create");
    expect(paramNames(op.parameters!)).toEqual(["projectName", "workerName", "title", "prompt"]);
  });

  test("note: commissionId content", () => {
    const op = findOp("commission.request.commission.note");
    expect(paramNames(op.parameters!)).toEqual(["commissionId", "content"]);
  });

  test("abandon: commissionId reason", () => {
    const op = findOp("commission.run.abandon");
    expect(paramNames(op.parameters!)).toEqual(["commissionId", "reason"]);
  });

  test("trigger update: commissionId status projectName", () => {
    const op = findOp("commission.trigger.commission.update");
    expect(paramNames(op.parameters!)).toEqual(["commissionId", "status", "projectName"]);
  });
});
