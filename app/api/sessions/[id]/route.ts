import { NextResponse } from "next/server";

import { sessionStore } from "@/lib/node-session-store";

function isValidSessionId(id: string): boolean {
  return !id.includes("..") && !id.includes("/");
}

export async function GET(
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

  return NextResponse.json(session);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidSessionId(id)) {
    return NextResponse.json(
      { error: "Invalid session ID" },
      { status: 400 },
    );
  }

  try {
    await sessionStore.deleteSession(id);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }
}
