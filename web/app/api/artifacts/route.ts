import { NextRequest, NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { projectName, artifactPath, content } = body as {
    projectName?: string;
    artifactPath?: string;
    content?: string;
  };

  if (!projectName || !artifactPath || content === undefined) {
    return NextResponse.json(
      { error: "Missing required fields: projectName, artifactPath, content" },
      { status: 400 }
    );
  }

  // Proxy to the daemon's POST /artifacts endpoint, which owns the
  // write + git commit + dependency check sequence.
  const result = await daemonFetch(
    `/artifacts?projectName=${encodeURIComponent(projectName)}`,
    {
      method: "POST",
      body: JSON.stringify({ artifactPath, content }),
    },
  );

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
