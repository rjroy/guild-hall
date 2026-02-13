import { NextResponse } from "next/server";

import { getAgentManager } from "@/lib/server-context";
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

  const agentManager = await getAgentManager();

  if (!agentManager.isQueryRunning(id)) {
    return NextResponse.json(
      { error: "No query is running for this session" },
      { status: 409 },
    );
  }

  agentManager.stopQuery(id);

  return NextResponse.json({ stopped: true });
}
