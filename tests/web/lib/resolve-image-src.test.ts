import { describe, expect, it } from "bun:test";
import { resolveImageSrc } from "@/web/lib/resolve-image-src";

describe("resolveImageSrc", () => {
  const project = "my-project";
  const artifactPath = "specs/design.md";

  it("returns empty string for undefined src", () => {
    expect(resolveImageSrc(undefined, project, artifactPath)).toBe("");
  });

  it("returns empty string for empty src", () => {
    expect(resolveImageSrc("", project, artifactPath)).toBe("");
  });

  it("passes through http URLs unchanged", () => {
    const url = "http://example.com/image.png";
    expect(resolveImageSrc(url, project, artifactPath)).toBe(url);
  });

  it("passes through https URLs unchanged", () => {
    const url = "https://cdn.example.com/photos/cat.jpg";
    expect(resolveImageSrc(url, project, artifactPath)).toBe(url);
  });

  it("resolves relative paths from the artifact directory", () => {
    const result = resolveImageSrc("generated/flow.png", project, artifactPath);
    expect(result).toBe(
      `/api/artifacts/image?project=${encodeURIComponent(project)}&path=${encodeURIComponent("specs/generated/flow.png")}`,
    );
  });

  it("resolves relative paths when artifact is in root directory", () => {
    const result = resolveImageSrc("diagram.png", project, "notes.md");
    expect(result).toBe(
      `/api/artifacts/image?project=${encodeURIComponent(project)}&path=${encodeURIComponent("diagram.png")}`,
    );
  });

  it("resolves absolute paths from .lore/ root", () => {
    const result = resolveImageSrc("/generated/hero.png", project, artifactPath);
    expect(result).toBe(
      `/api/artifacts/image?project=${encodeURIComponent(project)}&path=${encodeURIComponent("generated/hero.png")}`,
    );
  });

  it("resolves deeply nested relative paths", () => {
    const deepArtifact = "specs/ui/components/buttons.md";
    const result = resolveImageSrc("../images/button.png", project, deepArtifact);
    expect(result).toBe(
      `/api/artifacts/image?project=${encodeURIComponent(project)}&path=${encodeURIComponent("specs/ui/components/../images/button.png")}`,
    );
  });

  it("encodes special characters in paths", () => {
    const result = resolveImageSrc("my image (1).png", project, artifactPath);
    expect(result).toBe(
      `/api/artifacts/image?project=${encodeURIComponent(project)}&path=${encodeURIComponent("specs/my image (1).png")}`,
    );
  });

  it("encodes special characters in project name", () => {
    const specialProject = "my project/v2";
    const result = resolveImageSrc("img.png", specialProject, "notes.md");
    expect(result).toBe(
      `/api/artifacts/image?project=${encodeURIComponent(specialProject)}&path=${encodeURIComponent("img.png")}`,
    );
  });
});
