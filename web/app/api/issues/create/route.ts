import { NextRequest, NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectName, title, body: issueBody } = body as {
    projectName?: string;
    title?: string;
    body?: string;
  };

  if (!projectName) {
    return NextResponse.json({ error: "projectName is required" }, { status: 400 });
  }
  if (!title || title.trim() === "") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.trim().length > 200) {
    return NextResponse.json({ error: "Title must be 200 characters or fewer" }, { status: 400 });
  }

  const payload: Record<string, string> = { projectName, title: title.trim() };
  if (issueBody && issueBody.trim() !== "") {
    payload.body = issueBody;
  }

  const result = await daemonFetch("/workspace/issue/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (isDaemonError(result)) {
    return NextResponse.json({ error: "Daemon is not running" }, { status: 503 });
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
