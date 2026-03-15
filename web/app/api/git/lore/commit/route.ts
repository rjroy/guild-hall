import { NextRequest, NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(request: NextRequest) {
  const projectName = request.nextUrl.searchParams.get("projectName");
  if (!projectName) {
    return NextResponse.json({ error: "Missing required query parameter: projectName" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message } = body as { message?: string };
  if (!message || message.trim() === "") {
    return NextResponse.json({ error: "Commit message is required" }, { status: 400 });
  }

  const result = await daemonFetch(
    `/workspace/git/lore/commit?projectName=${encodeURIComponent(projectName)}`,
    {
      method: "POST",
      body: JSON.stringify({ message: message.trim() }),
    },
  );

  if (isDaemonError(result)) {
    return NextResponse.json({ error: "Daemon is not running" }, { status: 503 });
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
