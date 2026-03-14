import { describe, expect, test } from "bun:test";
import { SkillHandlerError } from "@/daemon/services/skill-types";

describe("SkillHandlerError", () => {
  test("is an instance of Error", () => {
    const err = new SkillHandlerError("something broke");
    expect(err).toBeInstanceOf(Error);
  });

  test("has name set to 'SkillHandlerError'", () => {
    const err = new SkillHandlerError("something broke");
    expect(err.name).toBe("SkillHandlerError");
  });

  test("preserves the message", () => {
    const err = new SkillHandlerError("commission not found");
    expect(err.message).toBe("commission not found");
  });

  test("defaults status to 500", () => {
    const err = new SkillHandlerError("internal failure");
    expect(err.status).toBe(500);
  });

  test("accepts a custom status code", () => {
    const err = new SkillHandlerError("not found", 404);
    expect(err.status).toBe(404);
  });

  test("status is readonly", () => {
    const err = new SkillHandlerError("conflict", 409);
    // Verify the property exists and has the expected value.
    // TypeScript enforces readonly at compile time; this confirms
    // the value is set correctly at runtime.
    expect(err.status).toBe(409);
  });
});
