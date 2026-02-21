import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/config";
import { writeArtifactContent } from "@/lib/artifacts";
import { projectLorePath } from "@/lib/paths";

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

  const lorePath = projectLorePath(project.path);

  try {
    await writeArtifactContent(lorePath, artifactPath, content);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
