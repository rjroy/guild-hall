import { parseArgs } from "node:util";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import fallbackApp from "./app";
import { createProductionApp } from "./app";
import {
  getSocketPath,
  cleanStaleSocket,
  writePidFile,
  removePidFile,
  removeSocketFile,
} from "./lib/socket";
import { consoleLog } from "@/daemon/lib/log";

// Pre-app logger for socket binding, PID file, and shutdown messages.
// daemon/index.ts is the composition root and creates its own logger
// directly via consoleLog (REQ-LOG-7).
const log = consoleLog("daemon");

// Parse CLI flags
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "packages-dir": { type: "string" },
  },
  strict: false,
});

const packagesDir = values["packages-dir"] as string | undefined;
if (packagesDir) {
  log.info(`packages-dir: ${packagesDir}`);
}

const socketPath = getSocketPath();

// Clean up stale socket from a previous crash.
// This is a per-entity liveness check (PID file), not a global cleanup.
// It only runs on daemon process start.
cleanStaleSocket(socketPath);

// Create the app with full production wiring (async: reads config,
// discovers packages, creates meeting session). Falls back to the
// basic app if production setup fails.
let app: { fetch: typeof fallbackApp.fetch };
let schedulerShutdown: (() => void) | undefined;
try {
  const { app: prodApp, shutdown } = await createProductionApp({ packagesDir, createLog: consoleLog });
  app = prodApp;
  schedulerShutdown = shutdown;
  log.info("production app initialized with meeting session and worker routes");
} catch (err) {
  log.warn(
    `Failed to create production app, falling back to basic app: ${errorMessage(err)}`,
  );
  app = fallbackApp;
}

const server = Bun.serve({
  unix: socketPath,
  fetch: app.fetch,
  // SSE connections are long-lived. Bun's default 10s idle timeout
  // kills them before any events arrive. Disable the timeout.
  idleTimeout: 0 as never,
});

writePidFile(socketPath);

log.info(`listening on ${socketPath} (PID ${process.pid})`);

function shutdown() {
  log.info("shutting down...");
  try {
    schedulerShutdown?.();
    void server.stop();
  } finally {
    // PID and socket must be removed even if server.stop() throws,
    // otherwise stale files block the next daemon start.
    removePidFile(socketPath);
    removeSocketFile(socketPath);
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
