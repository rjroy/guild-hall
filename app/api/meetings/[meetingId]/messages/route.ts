import { NextRequest, NextResponse } from "next/server";
import { daemonStreamAsync, isDaemonError } from "@/lib/daemon-client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message } = body as { message?: string };

  if (!message) {
    return NextResponse.json(
      { error: "Missing required field: message" },
      { status: 400 },
    );
  }

  const result = await daemonStreamAsync(
    `/meetings/${meetingId}/messages`,
    JSON.stringify({ message }),
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
