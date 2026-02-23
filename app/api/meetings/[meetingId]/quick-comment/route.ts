import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";
import { readMeetingMeta } from "@/lib/meetings";
import { getGuildHallHome, integrationWorktreePath } from "@/lib/paths";
import * as path from "node:path";

/**
 * POST /api/meetings/[meetingId]/quick-comment
 *
 * Compound action: creates a commission from a meeting request's context,
 * then declines the meeting. The user provides a prompt; the worker name
 * and linked artifacts come from the meeting request artifact.
 *
 * Atomicity:
 * - If commission creation fails, the meeting is NOT declined.
 * - If decline fails after commission creation, the commission ID is still
 *   returned (the commission is the valuable output).
 */
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

  const { projectName, prompt } = body as {
    projectName?: string;
    prompt?: string;
  };

  if (!projectName || !prompt) {
    return NextResponse.json(
      { error: "Missing required fields: projectName, prompt" },
      { status: 400 },
    );
  }

  // 1. Read the meeting request artifact to get worker and linked_artifacts
  const ghHome = getGuildHallHome();
  const integrationPath = integrationWorktreePath(ghHome, projectName);
  const meetingArtifactPath = path.join(
    integrationPath,
    ".lore",
    "meetings",
    `${meetingId}.md`,
  );

  let workerName: string;
  let dependencies: string[];
  try {
    const meta = await readMeetingMeta(meetingArtifactPath, projectName);
    workerName = meta.worker;
    dependencies = meta.linked_artifacts;

    if (!workerName) {
      return NextResponse.json(
        { error: "Meeting request has no worker assigned" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: `Meeting artifact not found: ${meetingId}` },
      { status: 404 },
    );
  }

  // 2. Create commission via daemon
  const title = prompt.length > 50 ? prompt.slice(0, 50) + "..." : prompt;

  const commissionResult = await daemonFetch("/commissions", {
    method: "POST",
    body: JSON.stringify({
      projectName,
      title,
      workerName,
      prompt,
      dependencies: dependencies.length > 0 ? dependencies : undefined,
    }),
  });

  if (isDaemonError(commissionResult)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  if (!commissionResult.ok) {
    const data = (await commissionResult.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const reason =
      typeof data.error === "string"
        ? data.error
        : `Commission creation failed (${commissionResult.status})`;
    return NextResponse.json({ error: reason }, { status: commissionResult.status });
  }

  const commissionData = (await commissionResult.json()) as Record<string, unknown>;
  const commissionId = commissionData.commissionId as string;

  // 3. Decline the meeting (best-effort after commission creation)
  const declineResult = await daemonFetch(`/meetings/${meetingId}/decline`, {
    method: "POST",
    body: JSON.stringify({ projectName }),
  });

  if (isDaemonError(declineResult) || !declineResult.ok) {
    // Log the failure but still return the commission ID.
    // The commission is the valuable output; the meeting request
    // can be manually declined later.
    console.warn(
      `[quick-comment] Failed to decline meeting ${meetingId} after creating commission ${commissionId}`,
    );
  }

  return NextResponse.json({ commissionId }, { status: 201 });
}
