import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commissionId: string }> },
) {
  const { commissionId } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  const result = await daemonFetch(
    "/commission/schedule/commission/update",
    {
      method: "POST",
      body: JSON.stringify({ commissionId, ...body }),
    },
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
