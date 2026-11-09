import { route } from "@/lib/http";
import { ledger, type LedgerKind } from "@/lib/paypal";
import { hideAddresses, ownRecord, seesWholeRecord } from "@/lib/say/record-scope";

/**
 * What this app has done with PayPal. Like Activity, it lists the invoices on this browser's own jobs and the shared sample;
 * "For judges" opens the whole ledger.
 */
export const GET = route(async (req) => {
  const kind = req.nextUrl.searchParams.get("kind") as LedgerKind | null;
  const all = ledger.list(kind ? { kind } : {});
  const own = seesWholeRecord(req) ? null : ownRecord(req).paypalIds;
  const entries = own ? all.filter((entry) => [entry.paypalId, entry.parentId, entry.orderId].some((id) => !!id && own.has(id))) : all;
  return { entries: hideAddresses(entries), scope: own ? "this browser" : "whole record" };
});
