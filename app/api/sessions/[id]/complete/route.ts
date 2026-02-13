import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/node-session-store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await sessionStore.getSession(id);

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  const { metadata } = session;

  if (metadata.status === "running") {
    return NextResponse.json(
      { error: "Stop the running query before completing the session" },
      { status: 409 },
    );
  }

  if (metadata.status === "completed" || metadata.status === "expired") {
    return NextResponse.json(metadata);
  }

  // idle or error: transition to completed
  const updated = await sessionStore.updateMetadata(id, {
    status: "completed",
    lastActivityAt: new Date().toISOString(),
  });

  return NextResponse.json(updated);
}
