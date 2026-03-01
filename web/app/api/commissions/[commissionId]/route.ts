import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ commissionId: string }> },
) {
  const { commissionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await daemonFetch(`/commissions/${commissionId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ commissionId: string }> },
) {
  const { commissionId } = await params;

  const result = await daemonFetch(`/commissions/${commissionId}`, {
    method: "DELETE",
  });

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
