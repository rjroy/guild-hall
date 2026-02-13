import { NextResponse } from "next/server";
import { z } from "zod";

import { getAgentManager } from "@/lib/server-context";
import { AgentManagerError } from "@/lib/agent-manager";

const SendMessageBodySchema = z.object({
  content: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = SendMessageBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.message },
      { status: 400 },
    );
  }

  const agentManager = await getAgentManager();

  try {
    await agentManager.runQuery(id, parsed.data.content);
  } catch (err) {
    if (err instanceof AgentManagerError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "accepted" }, { status: 202 });
}
