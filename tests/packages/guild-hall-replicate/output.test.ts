import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  resolveOutputDir,
  generateFilename,
  detectExtension,
  validateInputFile,
} from "@/packages/guild-hall-replicate/output";
import { formatTimestamp } from "@/daemon/lib/toolbox-utils";

// -- Temp dir tracking --

const cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  cleanupDirs.length = 0;
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rpl-output-"));
  cleanupDirs.push(dir);
  return dir;
}

// -- resolveOutputDir --

describe("resolveOutputDir", () => {
  test("constructs path from deps fields for commission context", async () => {
    const tmpDir = await makeTempDir();
    // Create the worktree directory that resolveWritePath will look for
    const worktreePath = path.join(tmpDir, "worktrees", "test-project", "commission-test");
    await fs.mkdir(worktreePath, { recursive: true });

    const result = await resolveOutputDir({
      guildHallHome: tmpDir,
      projectName: "test-project",
      contextId: "commission-test",
      contextType: "commission",
    });

    expect(result).toBe(path.join(worktreePath, ".lore", "generated"));
  });

  test("creates directory when it does not exist", async () => {
    const tmpDir = await makeTempDir();
    // Create the worktree directory
    const worktreePath = path.join(tmpDir, "worktrees", "test-project", "commission-test");
    await fs.mkdir(worktreePath, { recursive: true });

    const outputDir = await resolveOutputDir({
      guildHallHome: tmpDir,
      projectName: "test-project",
      contextId: "commission-test",
      contextType: "commission",
    });

    const stat = await fs.stat(outputDir);
    expect(stat.isDirectory()).toBe(true);
  });

  test("falls back to integration worktree for mail context", async () => {
    const tmpDir = await makeTempDir();
    // Don't create an activity worktree; integration worktree should be used
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const result = await resolveOutputDir({
      guildHallHome: tmpDir,
      projectName: "test-project",
      contextId: "mail-session-1",
      contextType: "mail",
    });

    expect(result).toBe(path.join(integrationPath, ".lore", "generated"));
  });
});

// -- generateFilename --

describe("generateFilename", () => {
  test("with no user filename produces {tool}-{timestamp}-{hash}.{ext}", () => {
    const filename = generateFilename("generate_image", "abcdef123456", "png");

    expect(filename).toMatch(/^generate_image-\d{8}-\d{6}-abcdef\.png$/);
  });

  test("with user filename returns it unchanged", () => {
    const filename = generateFilename("generate_image", "abcdef123456", "png", "my-image.png");
    expect(filename).toBe("my-image.png");
  });

  test("hash uses first 6 chars of prediction ID", () => {
    const filename = generateFilename("edit_image", "xyz789longer", "jpg");
    expect(filename).toContain("-xyz789.");
  });
});

// -- detectExtension --

describe("detectExtension", () => {
  test("extracts .png from typical Replicate URL", () => {
    expect(detectExtension("https://replicate.delivery/pbxt/abc123/output.png")).toBe("png");
  });

  test("extracts .jpg from URL with query params", () => {
    expect(detectExtension("https://replicate.delivery/pbxt/abc/result.jpg?token=xyz")).toBe("jpg");
  });

  test("extracts .webp", () => {
    expect(detectExtension("https://example.com/images/output.webp")).toBe("webp");
  });

  test("falls back to png for unrecognizable URL", () => {
    expect(detectExtension("https://replicate.delivery/pbxt/abc123/output")).toBe("png");
  });

  test("falls back to png for non-image extension", () => {
    expect(detectExtension("https://example.com/file.txt")).toBe("png");
  });
});

// -- validateInputFile --

describe("validateInputFile", () => {
  test("succeeds for existing readable file", async () => {
    const tmpDir = await makeTempDir();
    const filePath = path.join(tmpDir, "test-image.png");
    await fs.writeFile(filePath, "fake-data");

    await expect(validateInputFile(filePath)).resolves.toBeUndefined();
  });

  test("throws with clear message for missing file", async () => {
    await expect(validateInputFile("/nonexistent/path/image.png")).rejects.toThrow(
      /Input file not found.*\/nonexistent\/path\/image\.png/,
    );
  });
});

// -- formatTimestamp (imported from toolbox-utils, verify format) --

describe("formatTimestamp", () => {
  test("produces YYYYMMDD-HHmmss format", () => {
    const date = new Date(2026, 2, 18, 14, 30, 45); // March 18, 2026 14:30:45
    const result = formatTimestamp(date);
    expect(result).toBe("20260318-143045");
  });
});
