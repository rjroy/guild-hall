/**
 * CreateMeetingButton is a client component that uses useState, useRouter,
 * useEffect, and fetch. It cannot be called outside a React render context
 * in bun test. This test verifies the module contract only, matching the
 * scope of commission-form.test.tsx.
 */

import { describe, test, expect } from "bun:test";

describe("CreateMeetingButton module", () => {
  test("exports a default function", async () => {
    const mod = await import(
      "@/apps/web/components/meeting/CreateMeetingButton"
    );
    expect(typeof mod.default).toBe("function");
  });

  test("default export is named CreateMeetingButton", async () => {
    const mod = await import(
      "@/apps/web/components/meeting/CreateMeetingButton"
    );
    expect(mod.default.name).toBe("CreateMeetingButton");
  });
});
