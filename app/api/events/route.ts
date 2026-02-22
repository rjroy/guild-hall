import { NextResponse } from "next/server";
import { daemonStreamAsync, isDaemonError } from "@/lib/daemon-client";

export async function GET() {
  const result = await daemonStreamAsync(
    "/events",
    undefined,
    undefined,
    { method: "GET" },
  );

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  return new Response(result, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
