import { describe, expect, test } from "bun:test";
import { OperationHandlerError } from "@/apps/daemon/services/operation-types";

describe("OperationHandlerError", () => {
  test("is an instance of Error", () => {
    const err = new OperationHandlerError("something broke");
    expect(err).toBeInstanceOf(Error);
  });

  test("has name set to 'OperationHandlerError'", () => {
    const err = new OperationHandlerError("something broke");
    expect(err.name).toBe("OperationHandlerError");
  });

  test("preserves the message", () => {
    const err = new OperationHandlerError("commission not found");
    expect(err.message).toBe("commission not found");
  });

  test("defaults status to 500", () => {
    const err = new OperationHandlerError("internal failure");
    expect(err.status).toBe(500);
  });

  test("accepts a custom status code", () => {
    const err = new OperationHandlerError("not found", 404);
    expect(err.status).toBe(404);
  });

  test("status is readonly", () => {
    const err = new OperationHandlerError("conflict", 409);
    // Verify the property exists and has the expected value.
    // TypeScript enforces readonly at compile time; this confirms
    // the value is set correctly at runtime.
    expect(err.status).toBe(409);
  });
});
