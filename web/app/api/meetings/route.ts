import { NextRequest, NextResponse } from "next/server";
import { daemonStreamAsync, isDaemonError } from "@/lib/daemon-client";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectName, workerName, prompt } = body as {
    projectName?: string;
    workerName?: string;
    prompt?: string;
  };

  if (!projectName || !workerName || !prompt) {
    return NextResponse.json(
      { error: "Missing required fields: projectName, workerName, prompt" },
      { status: 400 },
    );
  }

  const result = await daemonStreamAsync(
    "/meetings",
    JSON.stringify({ projectName, workerName, prompt }),
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
