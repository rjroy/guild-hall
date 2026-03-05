import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "yaml";
import { PUT } from "@/web/app/api/artifacts/route";
import { NextRequest } from "next/server";

let tmpDir: string;
let configDir: string;
let projectDir: string;
let integrationDir: string;
let loreDir: string;
let savedGuildHallHome: string | undefined;

/**
 * Creates a NextRequest with a JSON body for the PUT endpoint.
 */
function makePutRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/artifacts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  savedGuildHallHome = process.env.GUILD_HALL_HOME;

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-api-test-"));
  configDir = path.join(tmpDir, ".guild-hall");
  projectDir = path.join(tmpDir, "project");
  // Integration worktree is at <ghHome>/projects/<projectName>/
  integrationDir = path.join(configDir, "projects", "test-project");
  loreDir = path.join(integrationDir, ".lore");

  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(loreDir, { recursive: true });

  // Point getGuildHallHome() at our temp config directory
  process.env.GUILD_HALL_HOME = configDir;

  // Write a config with one project
  const config = {
    projects: [
      { name: "test-project", path: projectDir },
    ],
  };
  await fs.writeFile(
    path.join(configDir, "config.yaml"),
    yaml.stringify(config),
    "utf-8"
  );
});

afterEach(async () => {
  // Restore original env var
  if (savedGuildHallHome === undefined) {
    delete process.env.GUILD_HALL_HOME;
  } else {
    process.env.GUILD_HALL_HOME = savedGuildHallHome;
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("PUT /api/artifacts", () => {
  test("saves artifact content with full raw text", async () => {
    const artifactPath = path.join(loreDir, "specs", "test.md");
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(
      artifactPath,
      "---\ntitle: Test\nstatus: draft\ntags: []\n---\nOld body content.",
      "utf-8"
    );

    const newRawContent = "---\ntitle: Test\nstatus: draft\ntags: []\n---\nNew body content.";
    const request = makePutRequest({
      projectName: "test-project",
      artifactPath: "specs/test.md",
      content: newRawContent,
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    const result = await fs.readFile(artifactPath, "utf-8");
    expect(result).toBe(newRawContent);
  });

  test("saves frontmatter-only file", async () => {
    const artifactPath = path.join(loreDir, "commissions", "test.md");
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    const original = "---\ntitle: Commission\nstatus: active\ntags: []\n---\n";
    await fs.writeFile(artifactPath, original, "utf-8");

    const edited = "---\ntitle: Commission\nstatus: complete\ntags: [commission]\n---\n";
    const request = makePutRequest({
      projectName: "test-project",
      artifactPath: "commissions/test.md",
      content: edited,
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);

    const result = await fs.readFile(artifactPath, "utf-8");
    expect(result).toBe(edited);
  });

  test("returns 400 for missing projectName", async () => {
    const request = makePutRequest({
      artifactPath: "specs/test.md",
      content: "body",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  test("returns 400 for missing artifactPath", async () => {
    const request = makePutRequest({
      projectName: "test-project",
      content: "body",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  test("returns 400 for missing content", async () => {
    const request = makePutRequest({
      projectName: "test-project",
      artifactPath: "specs/test.md",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  test("returns 400 for invalid JSON", async () => {
    const request = new NextRequest("http://localhost:3000/api/artifacts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid JSON");
  });

  test("returns 404 for unknown project", async () => {
    const request = makePutRequest({
      projectName: "nonexistent-project",
      artifactPath: "specs/test.md",
      content: "body",
    });

    const response = await PUT(request);
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Project not found");
  });
});
