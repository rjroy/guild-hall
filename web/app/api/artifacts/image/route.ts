import { NextRequest, NextResponse } from "next/server";
import { daemonFetchBinary, isDaemonError } from "@/lib/daemon-client";

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project");
  const imagePath = request.nextUrl.searchParams.get("path");

  if (!project || !imagePath) {
    return NextResponse.json(
      { error: "Missing project or path" },
      { status: 400 },
    );
  }

  const result = await daemonFetchBinary(
    `/workspace/artifact/image/read?projectName=${encodeURIComponent(project)}&path=${encodeURIComponent(imagePath)}`,
  );

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  if (result.status !== 200) {
    return new NextResponse(result.body, { status: result.status });
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "Content-Type": result.headers["content-type"] ?? "application/octet-stream",
      "Cache-Control": result.headers["cache-control"] ?? "max-age=300",
    },
  });
}
