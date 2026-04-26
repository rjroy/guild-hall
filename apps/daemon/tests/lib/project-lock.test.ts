/**
 * Tests for daemon/lib/project-lock.ts: per-project mutex for git operations.
 *
 * Verifies:
 * - Two concurrent operations on the same project are serialized
 * - Operations on different projects run independently (concurrently)
 * - Errors in one operation don't break the chain for subsequent operations
 * - clearProjectLocks resets state
 */

import { describe, test, expect, afterEach } from "bun:test";
import { withProjectLock, clearProjectLocks } from "@/apps/daemon/lib/project-lock";

afterEach(() => {
  clearProjectLocks();
});

describe("withProjectLock", () => {
  test("two concurrent operations on the same project are serialized", async () => {
    const order: string[] = [];
    let resolveFirst: (() => void) | undefined;

    // First operation: starts immediately but blocks on a promise we control
    const firstOp = withProjectLock("project-a", async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      order.push("first-end");
      return "first";
    });

    // Second operation: queued behind the first
    // eslint-disable-next-line @typescript-eslint/require-await
    const secondOp = withProjectLock("project-a", async () => {
      order.push("second-start");
      order.push("second-end");
      return "second";
    });

    // Give the event loop a tick so the first op starts
    await new Promise<void>((r) => setTimeout(r, 10));

    // At this point, first has started but second should NOT have started
    expect(order).toEqual(["first-start"]);

    // Release the first operation
    resolveFirst!();

    const [result1, result2] = await Promise.all([firstOp, secondOp]);

    expect(result1).toBe("first");
    expect(result2).toBe("second");
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  test("operations on different projects run independently", async () => {
    const order: string[] = [];
    let resolveA: (() => void) | undefined;
    let resolveB: (() => void) | undefined;

    const opA = withProjectLock("project-a", async () => {
      order.push("a-start");
      await new Promise<void>((resolve) => {
        resolveA = resolve;
      });
      order.push("a-end");
      return "a";
    });

    const opB = withProjectLock("project-b", async () => {
      order.push("b-start");
      await new Promise<void>((resolve) => {
        resolveB = resolve;
      });
      order.push("b-end");
      return "b";
    });

    // Give the event loop a tick so both ops start
    await new Promise<void>((r) => setTimeout(r, 10));

    // Both should have started concurrently
    expect(order).toContain("a-start");
    expect(order).toContain("b-start");
    expect(order).toHaveLength(2);

    resolveB!();
    await new Promise<void>((r) => setTimeout(r, 10));

    // B finished while A is still blocked
    expect(order).toContain("b-end");
    expect(order).not.toContain("a-end");

    resolveA!();
    const [resultA, resultB] = await Promise.all([opA, opB]);

    expect(resultA).toBe("a");
    expect(resultB).toBe("b");
  });

  test("error in one operation does not break the chain", async () => {
    const order: string[] = [];

    // First operation: will throw
    // eslint-disable-next-line @typescript-eslint/require-await
    const failingOp = withProjectLock("project-a", async () => {
      order.push("failing-start");
      throw new Error("boom");
    });

    // Second operation: should still execute
    // eslint-disable-next-line @typescript-eslint/require-await
    const succeedingOp = withProjectLock("project-a", async () => {
      order.push("succeeding-start");
      return "ok";
    });

    // The failing op should reject
    await expect(failingOp).rejects.toThrow("boom");

    // The succeeding op should still complete
    const result = await succeedingOp;
    expect(result).toBe("ok");
    expect(order).toEqual(["failing-start", "succeeding-start"]);
  });

  test("returns the value from the wrapped function", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const result = await withProjectLock("project-x", async () => {
      return { answer: 42 };
    });

    expect(result).toEqual({ answer: 42 });
  });

  test("three queued operations run in order", async () => {
    const order: number[] = [];
    let resolve1: (() => void) | undefined;

    const op1 = withProjectLock("project-a", async () => {
      await new Promise<void>((r) => { resolve1 = r; });
      order.push(1);
    });

    // eslint-disable-next-line @typescript-eslint/require-await
    const op2 = withProjectLock("project-a", async () => {
      order.push(2);
    });

    // eslint-disable-next-line @typescript-eslint/require-await
    const op3 = withProjectLock("project-a", async () => {
      order.push(3);
    });

    await new Promise<void>((r) => setTimeout(r, 10));
    expect(order).toEqual([]);

    resolve1!();
    await Promise.all([op1, op2, op3]);

    expect(order).toEqual([1, 2, 3]);
  });
});
