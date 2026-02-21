import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;

  const result = await daemonFetch(`/meetings/${meetingId}/interrupt`, {
    method: "POST",
  });

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const body = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(body, { status: result.status });
}
