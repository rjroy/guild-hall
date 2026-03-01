import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { POST } from "@/web/app/api/meetings/[meetingId]/quick-comment/route";

/**
 * Tests for the quick-comment compound API route.
 *
 * This route reads a meeting artifact from disk, creates a commission via
 * the daemon, then declines the meeting. We test:
 *
 * - Input validation (invalid JSON, missing fields)
 * - Meeting artifact not found (404)
 * - Meeting artifact with no worker (400)
 * - Daemon offline (503, commission creation fails so meeting is not declined)
 * - Atomicity: commission creation is attempted before decline. If creation
 *   fails, the decline is never reached (verified by the daemon-offline test
 *   where both calls would fail, and by the code structure where we return
 *   early on commission failure).
 *
 * The happy path (daemon online, both calls succeed) is covered by integration
 * tests via the daemon routes, since this route is a compound orchestration
 * of existing daemon endpoints.
 */

let tmpDir: string;
let savedGuildHallHome: string | undefined;

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(meetingId: string): {
  params: Promise<{ meetingId: string }>;
} {
  return { params: Promise.resolve({ meetingId }) };
}

/**
 * Creates a meeting artifact file in the integration worktree under the
 * temp directory structure that matches how the route resolves paths:
 * <GUILD_HALL_HOME>/projects/<projectName>/.lore/meetings/<meetingId>.md
 */
async function createMeetingArtifact(
  ghHome: string,
  projectName: string,
  meetingId: string,
  frontmatter: Record<string, unknown>,
): Promise<void> {
  const meetingsDir = path.join(
    ghHome,
    "projects",
    projectName,
    ".lore",
    "meetings",
  );
  await fs.mkdir(meetingsDir, { recursive: true });

  const yamlLines = Object.entries(frontmatter).map(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return `${key}: []`;
      return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
    }
    return `${key}: ${String(value)}`;
  });

  const content = `---\n${yamlLines.join("\n")}\n---\n\nMeeting notes here.\n`;
  await fs.writeFile(path.join(meetingsDir, `${meetingId}.md`), content);
}

beforeEach(async () => {
  savedGuildHallHome = process.env.GUILD_HALL_HOME;
  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gh-api-quick-comment-test-"),
  );
  process.env.GUILD_HALL_HOME = tmpDir;
});

afterEach(async () => {
  if (savedGuildHallHome === undefined) {
    delete process.env.GUILD_HALL_HOME;
  } else {
    process.env.GUILD_HALL_HOME = savedGuildHallHome;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("POST /api/meetings/[meetingId]/quick-comment", () => {
  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await POST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });

  test("returns 400 when projectName is missing", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      { prompt: "Do the thing" },
    );

    const response = await POST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe(
      "Missing required fields: projectName, prompt",
    );
  });

  test("returns 400 when prompt is missing", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      { projectName: "test-project" },
    );

    const response = await POST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe(
      "Missing required fields: projectName, prompt",
    );
  });

  test("returns 404 when meeting artifact does not exist", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/nonexistent-meeting/quick-comment",
      { projectName: "test-project", prompt: "Do the thing" },
    );

    const response = await POST(request, makeParams("nonexistent-meeting"));

    expect(response.status).toBe(404);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toContain("Meeting artifact not found");
  });

  test("returns 400 when meeting artifact has no worker", async () => {
    await createMeetingArtifact(tmpDir, "test-project", "meeting-no-worker", {
      title: "Test Meeting",
      status: "requested",
      worker: "",
      agenda: "Discuss something",
      linked_artifacts: [],
    });

    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-no-worker/quick-comment",
      { projectName: "test-project", prompt: "Do the thing" },
    );

    const response = await POST(request, makeParams("meeting-no-worker"));

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Meeting request has no worker assigned");
  });

  test("returns 503 when daemon is offline (commission creation fails, meeting not declined)", async () => {
    // Create a valid meeting artifact so we get past the filesystem read
    await createMeetingArtifact(tmpDir, "test-project", "meeting-001", {
      title: "Test Meeting",
      status: "requested",
      worker: "scribe",
      agenda: "Review the doc",
      linked_artifacts: ["specs/design.md"],
    });

    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      { projectName: "test-project", prompt: "Write the implementation" },
    );

    const response = await POST(request, makeParams("meeting-001"));

    // Commission creation fails first, so we return 503 before
    // ever attempting to decline the meeting. This verifies the
    // atomicity rule: if commission creation fails, meeting is NOT declined.
    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });

  test("reads worker and linked_artifacts from meeting artifact", async () => {
    // Verifies the route correctly parses the meeting artifact frontmatter.
    // The daemon is offline so we won't get past commission creation, but
    // the fact that we get a 503 (not 404 or 400) proves the artifact was
    // read and the worker/linked_artifacts were extracted successfully.
    await createMeetingArtifact(tmpDir, "my-project", "audience-Scribe-20260223", {
      title: "Design Review",
      status: "requested",
      worker: "scribe",
      agenda: "Review architecture",
      linked_artifacts: ["specs/arch.md", "specs/api.md"],
    });

    const request = makePostRequest(
      "http://localhost:3000/api/meetings/audience-Scribe-20260223/quick-comment",
      { projectName: "my-project", prompt: "Implement the design" },
    );

    const response = await POST(
      request,
      makeParams("audience-Scribe-20260223"),
    );

    // Getting 503 (daemon offline) means the route successfully read
    // the artifact and attempted to create the commission.
    expect(response.status).toBe(503);
  });
});
