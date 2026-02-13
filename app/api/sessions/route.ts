import { NextResponse } from "next/server";

import { CreateSessionBodySchema } from "@/lib/schemas";
import { sessionStore } from "@/lib/node-session-store";

export async function GET() {
  const sessions = await sessionStore.listSessions();
  return NextResponse.json(sessions);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = CreateSessionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const metadata = await sessionStore.createSession(
    parsed.data.name,
    parsed.data.guildMembers,
  );

  return NextResponse.json(metadata, { status: 201 });
}
