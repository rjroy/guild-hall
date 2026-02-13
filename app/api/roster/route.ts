import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { getRoster, type FileSystem } from "@/lib/plugin-discovery";

const nodeFs: FileSystem = {
  readdir: (dirPath: string) => fs.readdir(dirPath),
  readFile: (filePath: string) => fs.readFile(filePath, "utf-8"),
  stat: (filePath: string) => fs.stat(filePath),
};

const guildMembersDir =
  process.env.GUILD_MEMBERS_DIR ?? path.resolve("./guild-members");

export async function GET() {
  const roster = await getRoster(guildMembersDir, nodeFs);
  return NextResponse.json(roster);
}
