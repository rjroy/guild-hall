import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await daemonFetch(`/meetings/${meetingId}/defer`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const responseBody = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(responseBody, { status: result.status });
}
