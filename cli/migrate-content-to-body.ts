import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import { readConfig } from "@/lib/config";
import { getConfigPath } from "@/lib/paths";

/**
 * One-time migration: move result_summary from YAML frontmatter to the
 * markdown body of commission artifacts. Dry-run by default; pass --apply
 * to write changes.
 */
export async function migrateContentToBody(
  apply: boolean,
  homeOverride?: string
): Promise<number> {
  const configFilePath = getConfigPath(homeOverride);

  let config;
  try {
    config = await readConfig(configFilePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Config error: ${message}`);
    return 1;
  }

  if (config.projects.length === 0) {
    console.log("No projects registered. Nothing to migrate.");
    return 0;
  }

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const project of config.projects) {
    const commissionsDir = path.join(project.path, ".lore", "commissions");

    let entries: string[];
    try {
      entries = await fs.readdir(commissionsDir);
    } catch {
      // No commissions directory for this project, skip
      continue;
    }

    const mdFiles = entries.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      const filePath = path.join(commissionsDir, file);

      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const parsed = matter(raw);

        // Skip if no result_summary in frontmatter
        if (!parsed.data.result_summary) {
          continue;
        }

        // Skip if body already has content (already migrated)
        if (parsed.content.trim().length > 0) {
          skippedCount++;
          console.log(`  SKIP (body not empty): ${project.name} / ${file}`);
          continue;
        }

        const summary = String(parsed.data.result_summary);

        if (!apply) {
          console.log(`  WOULD MIGRATE: ${project.name} / ${file}`);
          migratedCount++;
          continue;
        }

        // Raw frontmatter splice to avoid gray-matter stringify reformatting.
        // Find the frontmatter boundaries (opening and closing ---)
        const closingIndex = raw.indexOf("\n---", 3);
        if (closingIndex === -1) {
          console.error(`  ERROR (no closing ---): ${project.name} / ${file}`);
          errorCount++;
          continue;
        }

        // Extract raw frontmatter lines (between the --- delimiters)
        const firstNewline = raw.indexOf("\n");
        const frontmatterRaw = raw.substring(firstNewline + 1, closingIndex);
        const lines = frontmatterRaw.split("\n");

        // Find result_summary and determine its extent.
        // A YAML value can span multiple lines if continuation lines are
        // indented or empty (block scalars, folded strings, etc).
        const startIdx = lines.findIndex((l) => l.startsWith("result_summary:"));
        if (startIdx === -1) {
          // gray-matter parsed it but we can't find it in raw text
          console.error(`  ERROR (key not found in raw): ${project.name} / ${file}`);
          errorCount++;
          continue;
        }

        // Walk forward: continuation lines start with whitespace or are empty
        let endIdx = startIdx + 1;
        while (endIdx < lines.length) {
          const line = lines[endIdx];
          if (line.length === 0 || line[0] === " " || line[0] === "\t") {
            endIdx++;
          } else {
            break;
          }
        }

        // Remove the result_summary lines
        const cleaned = [
          ...lines.slice(0, startIdx),
          ...lines.slice(endIdx),
        ];

        // Trim trailing empty lines to avoid double newline when
        // result_summary was the last frontmatter key
        while (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") {
          cleaned.pop();
        }

        // Rebuild: opening --- + cleaned frontmatter + closing --- + blank line + body
        const result = "---\n" + cleaned.join("\n") + "\n---\n\n" + summary + "\n";

        await fs.writeFile(filePath, result, "utf-8");
        console.log(`  MIGRATED: ${project.name} / ${file}`);
        migratedCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ERROR: ${project.name} / ${file}: ${message}`);
        errorCount++;
      }
    }
  }

  console.log("");
  if (apply) {
    console.log(
      `Migration complete: ${migratedCount} migrated, ${skippedCount} skipped, ${errorCount} errors`
    );
  } else {
    console.log(
      `Dry run complete: ${migratedCount} would migrate, ${skippedCount} would skip, ${errorCount} errors`
    );
    if (migratedCount > 0) {
      console.log("Run with --apply to write changes.");
    }
  }

  return errorCount > 0 ? 1 : 0;
}
