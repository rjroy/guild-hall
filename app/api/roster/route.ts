import { NextResponse } from "next/server";

import { getRosterMap } from "@/lib/server-context";

export async function GET() {
  const rosterMap = await getRosterMap();
  const roster = Array.from(rosterMap.values());
  return NextResponse.json(roster);
}
