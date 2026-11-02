import { route } from "@/lib/http";
import { getAuditLog } from "@/lib/agent/audit";

/** Anyone can read this page, so a real address someone typed stays out of it. The stored log is untouched. */
const REAL_ADDRESS = /[\w.+-]+@(?!(?:personal\.|business\.)?example\.com\b)[\w-]+(?:\.[\w-]+)+/gi;

/** Append-only audit log + hash-chain verification. */
export const GET = route(async (req) => {
  const log = getAuditLog();
  const runId = req.nextUrl.searchParams.get("runId") ?? undefined;
  const entries = JSON.parse(JSON.stringify(log.list({ runId, limit: 500 }).reverse()).replace(REAL_ADDRESS, "[address hidden]"));
  return { entries, integrity: log.verify() };
});
