import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createEventBus } from "@/daemon/lib/event-bus";
import { ensureHeartbeatFile } from "@/daemon/services/heartbeat/heartbeat-file";
import { HeartbeatService } from "@/daemon/services/heartbeat/index";

let tmpDir: string;
let guildHallHome: string;
let projectPath: string;

const PROJECT_NAME = "test-project";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "heartbeat-svc-test-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
  projectPath = path.join(guildHallHome, "projects", PROJECT_NAME);
  await fs.mkdir(projectPath, { recursive: true });
  await ensureHeartbeatFile(projectPath);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("HeartbeatService", () => {
  test("constructor registers condensation subscriber (REQ-HBT-50)", async () => {
    const eventBus = createEventBus();
    const service = new HeartbeatService({ eventBus, guildHallHome });

    // Emit a terminal event; should be processed by the condensation subscriber
    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-svc-test",
      status: "completed",
      projectName: PROJECT_NAME,
    });

    await new Promise((r) => setTimeout(r, 50));

    const content = await fs.readFile(
      path.join(projectPath, ".lore", "heartbeat.md"),
      "utf-8",
    );
    expect(content).toContain("comm-svc-test completed");

    service.stop();
  });

  test("stop() unsubscribes condensation", async () => {
    const eventBus = createEventBus();
    const service = new HeartbeatService({ eventBus, guildHallHome });

    service.stop();

    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-after-stop",
      status: "completed",
      projectName: PROJECT_NAME,
    });

    await new Promise((r) => setTimeout(r, 50));

    const content = await fs.readFile(
      path.join(projectPath, ".lore", "heartbeat.md"),
      "utf-8",
    );
    expect(content).not.toContain("comm-after-stop");
  });

  test("stop() is idempotent", () => {
    const eventBus = createEventBus();
    const service = new HeartbeatService({ eventBus, guildHallHome });

    // Should not throw
    service.stop();
    service.stop();
  });
});
