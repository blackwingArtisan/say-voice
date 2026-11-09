import { route } from "@/lib/http";
import { getAuditLog } from "@/lib/agent/audit";
import { hideAddresses, ownRecord, seesWholeRecord } from "@/lib/say/record-scope";

/**
 * Append-only audit log + hash-chain verification. Like Activity, it shows this browser's own jobs and the shared sample
 * (and steps that belong to no job); "For judges" opens the whole record. The chain is verified over the whole log either way.
 */
export const GET = route(async (req) => {
  const log = getAuditLog();
  const runId = req.nextUrl.searchParams.get("runId") ?? undefined;
  const all = log.list({ runId, limit: 500 }).reverse();
  const own = seesWholeRecord(req) ? null : ownRecord(req).runIds;
  const entries = own ? all.filter((entry) => !entry.runId || own.has(entry.runId)) : all;
  return { entries: hideAddresses(entries), scope: own ? "this browser" : "whole record", integrity: log.verify() };
});
