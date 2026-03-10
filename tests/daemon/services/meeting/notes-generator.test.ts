/* eslint-disable @typescript-eslint/require-await */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  generateMeetingNotes,
  type NotesGeneratorDeps,
  type NotesQueryFn,
} from "@/daemon/services/meeting/notes-generator";
import type { AppConfig } from "@/lib/types";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-notes-test-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");

  // Create state directory with a transcript so notes generation has input
  const transcriptDir = path.join(guildHallHome, "state", "meetings", "test-meeting");
  await fs.mkdir(transcriptDir, { recursive: true });
  await fs.writeFile(
    path.join(transcriptDir, "transcript.md"),
    "User: Hello\nAssistant: Hi there",
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Creates a mock queryFn that captures the options passed to it.
 */
function createMockQueryFn(responseText = "Meeting notes content") {
  const capturedOptions: Record<string, unknown>[] = [];

  const queryFn: NotesQueryFn = async function* (params) {
    capturedOptions.push(params.options as Record<string, unknown>);
    yield {
      type: "assistant",
      message: {
        content: [{ type: "text", text: responseText }],
      },
    } as never;
  };

  return { queryFn, getCapturedOptions: () => capturedOptions };
}

describe("notes generator model configuration", () => {
  test("uses configured model from config.systemModels.meetingNotes", async () => {
    const mock = createMockQueryFn();
    const config: AppConfig = {
      projects: [],
      systemModels: { meetingNotes: "haiku" },
    };

    const deps: NotesGeneratorDeps = {
      guildHallHome,
      queryFn: mock.queryFn,
      config,
    };

    const result = await generateMeetingNotes("test-meeting", tmpDir, "test-worker", deps);

    expect(result.success).toBe(true);
    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("haiku");
  });

  test("falls back to sonnet when config.systemModels.meetingNotes is absent", async () => {
    const mock = createMockQueryFn();
    const config: AppConfig = {
      projects: [],
      systemModels: {},
    };

    const deps: NotesGeneratorDeps = {
      guildHallHome,
      queryFn: mock.queryFn,
      config,
    };

    const result = await generateMeetingNotes("test-meeting", tmpDir, "test-worker", deps);

    expect(result.success).toBe(true);
    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("sonnet");
  });

  test("falls back to sonnet when config is absent from deps entirely", async () => {
    const mock = createMockQueryFn();

    const deps: NotesGeneratorDeps = {
      guildHallHome,
      queryFn: mock.queryFn,
    };

    const result = await generateMeetingNotes("test-meeting", tmpDir, "test-worker", deps);

    expect(result.success).toBe(true);
    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("sonnet");
  });

  test("resolves local model to definition.modelId and sets env", async () => {
    const mock = createMockQueryFn();
    const config: AppConfig = {
      projects: [],
      models: [
        {
          name: "my-local",
          modelId: "llama3:8b",
          baseUrl: "http://localhost:11434",
          auth: { token: "test-token", apiKey: "test-key" },
        },
      ],
      systemModels: { meetingNotes: "my-local" },
    };

    const deps: NotesGeneratorDeps = {
      guildHallHome,
      queryFn: mock.queryFn,
      config,
    };

    const result = await generateMeetingNotes("test-meeting", tmpDir, "test-worker", deps);

    expect(result.success).toBe(true);
    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("llama3:8b");
    const env = options[0].env as Record<string, string>;
    expect(env.ANTHROPIC_BASE_URL).toBe("http://localhost:11434");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("test-token");
    expect(env.ANTHROPIC_API_KEY).toBe("test-key");
  });

  test("unrecognized model returns failure result with model name", async () => {
    const mock = createMockQueryFn();
    const config: AppConfig = {
      projects: [],
      systemModels: { meetingNotes: "nonexistent-model" },
    };

    const deps: NotesGeneratorDeps = {
      guildHallHome,
      queryFn: mock.queryFn,
      config,
    };

    const result = await generateMeetingNotes("test-meeting", tmpDir, "test-worker", deps);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("nonexistent-model");
    }
    // queryFn should not have been called
    expect(mock.getCapturedOptions().length).toBe(0);
  });
});
