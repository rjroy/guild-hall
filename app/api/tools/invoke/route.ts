import { NextResponse } from "next/server";

import { InvokeToolBodySchema } from "@/lib/schemas";
import { getMCPManager, getRosterMap } from "@/lib/server-context";
import type { MCPManager } from "@/lib/mcp-manager";
import type { GuildMember } from "@/lib/types";

/** Dependencies injected for testability. */
export type InvokeToolDeps = {
  mcpManager: MCPManager;
  roster: Map<string, GuildMember>;
};

/**
 * Core handler logic, separated from Next.js singleton wiring for testability.
 * The exported POST function calls this with real singletons from server-context.
 */
export async function handleInvokeTool(
  request: Request,
  deps: InvokeToolDeps,
): Promise<NextResponse> {
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

  const parsed = InvokeToolBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.message },
      { status: 400 },
    );
  }

  const { guildMember, toolName, toolInput } = parsed.data;

  // Verify the guild member exists in the roster
  if (!deps.roster.has(guildMember)) {
    return NextResponse.json(
      { error: `Guild member "${guildMember}" not found` },
      { status: 404 },
    );
  }

  // Invoke the tool via MCPManager
  try {
    const result = await deps.mcpManager.invokeTool(
      guildMember,
      toolName,
      toolInput,
    );
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const [mcpManager, roster] = await Promise.all([
    getMCPManager(),
    getRosterMap(),
  ]);

  return handleInvokeTool(request, { mcpManager, roster });
}
