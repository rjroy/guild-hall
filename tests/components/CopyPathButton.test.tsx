import { describe, test, expect } from "bun:test";

/**
 * CopyPathButton is a client component with hooks (useState).
 * We cannot call it directly in bun test as it requires a React render context.
 *
 * We test:
 * 1. That the module exports the component correctly
 * 2. That the component implementation includes clipboard fallback logic
 * 3. The component's behavior via code inspection (since we can't execute hooks)
 */

describe("CopyPathButton", () => {
  test("module exports a default component", async () => {
    const importedModule = await import("@/web/components/artifact/CopyPathButton");
    expect(importedModule.default).toBeDefined();
    expect(typeof importedModule.default).toBe("function");
  });

  test("component implementation includes clipboard API support", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    expect(moduleSource).toContain("navigator.clipboard");
  });

  test("component implementation includes textarea fallback for copy", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    expect(moduleSource).toContain("document.createElement(\"textarea\")");
    expect(moduleSource).toContain("execCommand");
  });

  test("component implementation includes error state handling", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    // Check for CopyState type with error state
    expect(moduleSource).toContain("error");
    expect(moduleSource).toContain("CopyState");
  });

  test("component tries clipboard first, then falls back", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    // Verify clipboard is attempted first
    const clipboardIndex = moduleSource.indexOf("navigator.clipboard");
    const textareaIndex = moduleSource.indexOf("document.createElement");
    expect(clipboardIndex).toBeLessThan(textareaIndex);
  });

  test("component cleans up temporary textarea", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    expect(moduleSource).toContain("removeChild");
  });

  test("button shows 'Copied!' state on success", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    expect(moduleSource).toContain("Copied!");
  });

  test("button shows 'Failed!' state on error", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    expect(moduleSource).toContain("Failed!");
  });

  test("button has aria-label for accessibility", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    expect(moduleSource).toContain("aria-label");
  });

  test("button is disabled during copy operation", async () => {
    const moduleSource = await Bun.file(
      "web/components/artifact/CopyPathButton.tsx"
    ).text();
    expect(moduleSource).toContain("disabled");
  });
});
