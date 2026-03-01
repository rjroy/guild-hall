import { NextResponse } from "next/server";
import { daemonHealth } from "@/lib/daemon-client";

export async function GET() {
  const health = await daemonHealth();

  if (!health) {
    return NextResponse.json({ status: "offline" });
  }

  return NextResponse.json(health);
}
