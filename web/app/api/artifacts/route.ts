import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/config";
import { writeRawArtifactContent } from "@/lib/artifacts";
import { projectLorePath, getGuildHallHome, integrationWorktreePath } from "@/lib/paths";
import { createGitOps } from "@/daemon/lib/git";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { projectName, artifactPath, content } = body as {
    projectName?: string;
    artifactPath?: string;
    content?: string;
  };

  if (!projectName || !artifactPath || content === undefined) {
    return NextResponse.json(
      { error: "Missing required fields: projectName, artifactPath, content" },
      { status: 400 }
    );
  }

  const project = await getProject(projectName);
  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const ghHome = getGuildHallHome();
  const integrationPath = integrationWorktreePath(ghHome, projectName);
  const lorePath = projectLorePath(integrationPath);

  try {
    await writeRawArtifactContent(lorePath, artifactPath, content);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Auto-commit the edit to the claude branch. Non-fatal if commit fails
  // (e.g., no actual changes after write, or integration worktree not set up).
  try {
    const git = createGitOps();
    await git.commitAll(integrationPath, `Edit artifact: ${artifactPath}`);
  } catch {
    // Commit failure is non-fatal
  }

  // Notify the daemon that artifacts changed so it can check if any blocked
  // commissions now have their dependencies satisfied. Non-fatal: the daemon
  // may be offline during development.
  try {
    const result = await daemonFetch("/commissions/check-dependencies", {
      method: "POST",
      body: JSON.stringify({ projectName }),
    });
    if (isDaemonError(result)) {
      // Daemon offline, ignore
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true });
}
