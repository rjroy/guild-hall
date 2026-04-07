import { NextRequest, NextResponse } from "next/server";
import { daemonFetchBinary, isDaemonError } from "@/lib/daemon-client";

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project");
  const mockupPath = request.nextUrl.searchParams.get("path");

  if (!project || !mockupPath) {
    return NextResponse.json(
      { error: "Missing project or path" },
      { status: 400 },
    );
  }

  const result = await daemonFetchBinary(
    `/workspace/artifact/mockup/read?projectName=${encodeURIComponent(project)}&path=${encodeURIComponent(mockupPath)}`,
  );

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  if (result.status !== 200) {
    return new NextResponse(new Uint8Array(result.body), {
      status: result.status,
      headers: {
        "Content-Type": result.headers["content-type"] ?? "application/json",
      },
    });
  }

  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.headers["content-type"] ?? "text/html; charset=utf-8",
      "Content-Security-Policy": result.headers["content-security-policy"] ?? "",
      "X-Content-Type-Options": result.headers["x-content-type-options"] ?? "nosniff",
      "Content-Disposition": result.headers["content-disposition"] ?? "inline",
      "Cache-Control": result.headers["cache-control"] ?? "no-cache",
    },
  });
}
