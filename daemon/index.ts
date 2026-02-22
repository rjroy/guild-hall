import { parseArgs } from "node:util";
import fallbackApp from "./app";
import { createProductionApp } from "./app";
import {
  getSocketPath,
  cleanStaleSocket,
  writePidFile,
  removePidFile,
  removeSocketFile,
} from "./lib/socket";

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
  console.log(`[daemon] packages-dir: ${packagesDir}`);
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
try {
  app = await createProductionApp({ packagesDir });
  console.log("[daemon] production app initialized with meeting session and worker routes");
} catch (err) {
  console.warn(
    `[daemon] Failed to create production app, falling back to basic app: ${err instanceof Error ? err.message : String(err)}`,
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

console.log(`[daemon] listening on ${socketPath} (PID ${process.pid})`);

function shutdown() {
  console.log("[daemon] shutting down...");
  try {
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
