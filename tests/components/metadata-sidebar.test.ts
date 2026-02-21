import { describe, test, expect } from "bun:test";
import { relatedToHref } from "@/components/artifact/MetadataSidebar";

describe("relatedToHref", () => {
  test("strips .lore/ prefix from related paths", () => {
    const href = relatedToHref(".lore/specs/guild-hall-system.md", "my-project");
    expect(href).toBe("/projects/my-project/artifacts/specs/guild-hall-system.md");
  });

  test("handles paths without .lore/ prefix", () => {
    const href = relatedToHref("specs/other.md", "my-project");
    expect(href).toBe("/projects/my-project/artifacts/specs/other.md");
  });

  test("encodes project names with special characters", () => {
    const href = relatedToHref(".lore/plans/impl.md", "my project");
    expect(href).toBe("/projects/my%20project/artifacts/plans/impl.md");
  });

  test("handles deeply nested paths", () => {
    const href = relatedToHref(".lore/plans/phase-1/step-3.md", "project");
    expect(href).toBe("/projects/project/artifacts/plans/phase-1/step-3.md");
  });

  test("encodes artifact path segments with special characters", () => {
    const href = relatedToHref(".lore/specs/my doc.md", "project");
    expect(href).toBe("/projects/project/artifacts/specs/my%20doc.md");
  });
});
