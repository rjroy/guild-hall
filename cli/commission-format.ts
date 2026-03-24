import type { CliOperation } from "./resolve";

type ResponseFormatter = (data: unknown) => string;

const COMMISSION_FORMATTERS: Record<string, ResponseFormatter> = {
  "/commission/request/commission/list": formatCommissionList,
  "/commission/request/commission/read": formatCommissionDetail,
};

const COMMISSION_ACTION_PATHS = new Set([
  "/commission/run/dispatch",
  "/commission/run/cancel",
  "/commission/run/abandon",
  "/commission/run/redispatch",
  "/commission/run/continue",
  "/commission/run/save",
]);

const ACTION_VERBS: Record<string, string> = {
  "/commission/run/dispatch": "Dispatched",
  "/commission/run/cancel": "Cancelled",
  "/commission/run/abandon": "Abandoned",
  "/commission/run/redispatch": "Redispatched",
  "/commission/run/continue": "Continued",
  "/commission/run/save": "Saved",
};

/**
 * Returns a custom formatter for the given operation path, or undefined
 * if no custom formatter is registered.
 */
export function getCommissionFormatter(
  path: string,
): ResponseFormatter | undefined {
  return COMMISSION_FORMATTERS[path];
}

/**
 * Returns true if the operation path is a commission action that should
 * use the confirmation formatter.
 */
export function isCommissionAction(path: string): boolean {
  return COMMISSION_ACTION_PATHS.has(path);
}

/**
 * Formats a commission action response as a single confirmation line.
 *
 * For dispatch/redispatch, the commission ID comes from the response body.
 * For other actions, it comes from the first positional argument.
 */
export function formatActionConfirmation(
  data: unknown,
  skill: CliOperation,
  positionalArgs: string[],
): string {
  const verb = ACTION_VERBS[skill.invocation.path] ?? "Done";

  const responseId =
    skill.invocation.path === "/commission/run/dispatch" ||
    skill.invocation.path === "/commission/run/redispatch"
      ? (data as { commissionId?: string })?.commissionId
      : undefined;

  const id = responseId ?? positionalArgs[0] ?? "unknown";
  return `${verb}: ${id}`;
}

interface CommissionListItem {
  commissionId: string;
  status: string;
  workerDisplayTitle: string;
  title: string;
}

/**
 * Formats the commission list response as a compact table.
 * Columns: ID, STATUS, WORKER, TITLE (truncated to terminal width).
 */
export function formatCommissionList(data: unknown): string {
  const { commissions } = data as { commissions: CommissionListItem[] };

  if (commissions.length === 0) return "(no commissions)";

  const termWidth = process.stdout.columns || 80;

  const rows = commissions.map((c) => ({
    id: c.commissionId,
    status: c.status,
    worker: c.workerDisplayTitle,
    title: c.title,
  }));

  // Calculate column widths for fixed columns
  const idWidth = Math.max("ID".length, ...rows.map((r) => r.id.length));
  const statusWidth = Math.max(
    "STATUS".length,
    ...rows.map((r) => r.status.length),
  );
  const workerWidth = Math.max(
    "WORKER".length,
    ...rows.map((r) => r.worker.length),
  );

  // Two spaces between columns, four columns = three gaps
  const fixedWidth = idWidth + statusWidth + workerWidth + 6;
  const titleWidth = Math.max(5, termWidth - fixedWidth - 2);

  function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 3) + "...";
  }

  const header = [
    "ID".padEnd(idWidth),
    "STATUS".padEnd(statusWidth),
    "WORKER".padEnd(workerWidth),
    "TITLE",
  ].join("  ");

  const separator = [
    "-".repeat(idWidth),
    "-".repeat(statusWidth),
    "-".repeat(workerWidth),
    "-".repeat(Math.min(titleWidth, "TITLE".length + 20)),
  ].join("  ");

  const dataRows = rows.map((r) =>
    [
      r.id.padEnd(idWidth),
      r.status.padEnd(statusWidth),
      r.worker.padEnd(workerWidth),
      truncate(r.title, titleWidth),
    ].join("  "),
  );

  return [header, separator, ...dataRows].join("\n");
}

interface TimelineEntry {
  timestamp: string;
  event: string;
  reason: string;
}

interface CommissionMeta {
  commissionId: string;
  title: string;
  status: string;
  type: string;
  date: string;
  worker: string;
  workerDisplayTitle: string;
  current_progress: string;
  result_summary: string;
}

interface CommissionDetailResponse {
  commission: CommissionMeta;
  timeline: TimelineEntry[];
  rawContent: string;
  scheduleInfo?: {
    cron: string;
    cronDescription: string;
    repeat: number | null;
    runsCompleted: number;
    lastRun: string | null;
    nextRun: string | null;
  };
  triggerInfo?: {
    match: Record<string, unknown>;
    approval: string;
    runsCompleted: number;
    lastTriggered: string | null;
  };
}

/**
 * Formats the commission detail response as a structured summary.
 *
 * Section ordering:
 * 1. Header (always)
 * 2. Schedule info (if scheduled)
 * 3. Trigger info (if triggered)
 * 4. Progress (if non-empty)
 * 5. Result (if non-empty)
 * 6. Timeline (always, last 5, most recent first)
 */
export function formatCommissionDetail(data: unknown): string {
  const resp = data as CommissionDetailResponse;
  const { commission: c, timeline, scheduleInfo, triggerInfo } = resp;
  const lines: string[] = [];

  // Header
  lines.push(c.commissionId);
  lines.push(`Status:   ${c.status}`);
  lines.push(`Worker:   ${c.workerDisplayTitle} (${c.worker})`);
  lines.push(`Created:  ${c.date}`);

  // Schedule info
  if (scheduleInfo) {
    lines.push("");
    lines.push(`Schedule: ${scheduleInfo.cronDescription}`);
    lines.push(`Runs:     ${scheduleInfo.runsCompleted}`);
    if (scheduleInfo.nextRun) {
      lines.push(`Next run: ${scheduleInfo.nextRun}`);
    }
  }

  // Trigger info
  if (triggerInfo) {
    lines.push("");
    lines.push(`Trigger:  ${JSON.stringify(triggerInfo.match)}`);
    lines.push(`Approval: ${triggerInfo.approval}`);
    lines.push(`Runs:     ${triggerInfo.runsCompleted}`);
    if (triggerInfo.lastTriggered) {
      lines.push(`Last:     ${triggerInfo.lastTriggered}`);
    }
  }

  // Progress
  if (c.current_progress) {
    lines.push("");
    lines.push(`Progress: ${c.current_progress}`);
  }

  // Result
  if (c.result_summary) {
    lines.push("");
    lines.push(`Result:   ${c.result_summary}`);
  }

  // Timeline (last 5, most recent first)
  lines.push("");
  lines.push("Timeline:");
  const recent = timeline.slice(-5).reverse();
  for (const entry of recent) {
    lines.push(`  [${entry.timestamp}] ${entry.event}: ${entry.reason}`);
  }

  return lines.join("\n");
}
