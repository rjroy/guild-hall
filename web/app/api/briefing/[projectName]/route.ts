import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function GET(
  _request: Request,
  props: { params: Promise<{ projectName: string }> },
) {
  const { projectName } = await props.params;

  const result = await daemonFetch(`/coordination/review/briefing/read?projectName=${encodeURIComponent(projectName)}`);

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const body = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(body, { status: result.status });
}
