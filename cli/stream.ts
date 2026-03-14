import { daemonStreamAsync, isDaemonError } from "@/lib/daemon-client";

/** Safely converts an unknown value to a display string. */
function str(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

/**
 * Connects to a streaming (SSE) daemon endpoint and prints events as they arrive.
 * Exits when the stream closes.
 */
export async function streamSkill(
  path: string,
  body?: string,
): Promise<void> {
  const result = await daemonStreamAsync(path, body);

  if (isDaemonError(result)) {
    throw new Error(
      result.type === "daemon_offline"
        ? "Daemon is not running. Start the daemon first: bun run dev:daemon"
        : `Failed to reach daemon: ${result.message}`,
    );
  }

  const reader = result.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      // SSE format: "data: {...}\n\n"
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6);
          try {
            const event = JSON.parse(payload) as Record<string, unknown>;
            if (event.type === "error") {
              console.error(`Error: ${str(event.reason || event.message || event)}`);
            } else if (event.type === "meeting_message" && event.content) {
              process.stdout.write(str(event.content));
            } else if (event.type === "meeting_status") {
              console.log(`[${str(event.status || event.type)}] ${str(event.message)}`);
            } else if (event.type === "commission_status") {
              console.log(`[${str(event.status || event.type)}] ${str(event.commissionId)} ${str(event.message)}`);
            } else {
              console.log(JSON.stringify(event));
            }
          } catch {
            console.log(payload);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
