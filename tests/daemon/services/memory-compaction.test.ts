/* eslint-disable @typescript-eslint/require-await */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  triggerCompaction,
  type CompactionDeps,
  type CompactQueryFn,
} from "@/daemon/services/memory-compaction";
import type { AppConfig } from "@/lib/types";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-compaction-test-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");

  // Create a worker memory directory with a file so compaction has something to process.
  // Path must match memoryScopeDir: memory/workers/<workerName>/
  const workerDir = path.join(guildHallHome, "memory", "workers", "test-worker");
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(
    path.join(workerDir, "session-1.md"),
    "Some memory content",
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Creates a mock compactFn that captures the options passed to it.
 */
function createMockCompactFn(responseText = "Compacted summary") {
  const capturedOptions: Record<string, unknown>[] = [];

  const compactFn: CompactQueryFn = async function* (params) {
    capturedOptions.push(params.options as Record<string, unknown>);
    yield {
      type: "assistant",
      message: {
        content: [{ type: "text", text: responseText }],
      },
    } as never;
  };

  return { compactFn, getCapturedOptions: () => capturedOptions };
}

describe("memory compaction model configuration", () => {
  test("uses configured model from config.systemModels.memoryCompaction", async () => {
    const mock = createMockCompactFn();
    const config: AppConfig = {
      projects: [],
      systemModels: { memoryCompaction: "haiku" },
    };

    const deps: CompactionDeps = {
      guildHallHome,
      compactFn: mock.compactFn,
      config,
    };

    await triggerCompaction("test-worker", "test-project", deps);

    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("haiku");
  });

  test("falls back to sonnet when config.systemModels.memoryCompaction is absent", async () => {
    const mock = createMockCompactFn();
    const config: AppConfig = {
      projects: [],
      systemModels: {},
    };

    const deps: CompactionDeps = {
      guildHallHome,
      compactFn: mock.compactFn,
      config,
    };

    await triggerCompaction("test-worker", "test-project", deps);

    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("sonnet");
  });

  test("falls back to sonnet when config is absent from deps entirely", async () => {
    const mock = createMockCompactFn();

    const deps: CompactionDeps = {
      guildHallHome,
      compactFn: mock.compactFn,
    };

    await triggerCompaction("test-worker", "test-project", deps);

    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("sonnet");
  });

  test("resolves local model to definition.modelId and sets env", async () => {
    const mock = createMockCompactFn();
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
      systemModels: { memoryCompaction: "my-local" },
    };

    const deps: CompactionDeps = {
      guildHallHome,
      compactFn: mock.compactFn,
      config,
    };

    await triggerCompaction("test-worker", "test-project", deps);

    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("llama3:8b");
    const env = options[0].env as Record<string, string>;
    expect(env.ANTHROPIC_BASE_URL).toBe("http://localhost:11434");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("test-token");
    expect(env.ANTHROPIC_API_KEY).toBe("test-key");
  });

  test("unrecognized model name is caught non-fatally (compaction skipped)", async () => {
    const mock = createMockCompactFn();
    const config: AppConfig = {
      projects: [],
      systemModels: { memoryCompaction: "nonexistent-model" },
    };

    const deps: CompactionDeps = {
      guildHallHome,
      compactFn: mock.compactFn,
      config,
    };

    // Should not throw; compaction is fire-and-forget
    await triggerCompaction("test-worker", "test-project", deps);

    // compactFn should not have been called (error happens before SDK call)
    expect(mock.getCapturedOptions().length).toBe(0);
  });
});
