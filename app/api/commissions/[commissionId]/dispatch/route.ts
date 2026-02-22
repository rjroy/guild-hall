import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ commissionId: string }> },
) {
  const { commissionId } = await params;

  const result = await daemonFetch(
    `/commissions/${commissionId}/dispatch`,
    { method: "POST" },
  );

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
