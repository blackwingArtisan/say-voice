/**
 * The timeline in a tradesperson's words. The kit's timeline speaks HTTP, tool names and
 * debug ids, which belong behind Details. This turns each step into one plain sentence, or
 * leaves it out. Shared with the browser, so no Node imports.
 */
import type { AuditEntry } from "@/lib/agent/audit";
import type { TimelineStatus, TimelineStep } from "@/lib/events/types";
import { formatMoney } from "@/lib/money";

export type PlainTone = "done" | "working" | "waiting" | "stopped" | "note";

export interface PlainStep {
  id: string;
  text: string;
  tone: PlainTone;
  at: string;
  /** The PayPal Agent Toolkit tool behind this step, for its chip. */
  toolkit?: string;
}

/** The reads the reminder agent makes through PayPal's Agent Toolkit, in plain words. */
export const TOOLKIT_READS: Record<string, [doing: string, done: string]> = {
  search_invoicing: ["The reminder agent is looking the invoice up on PayPal", "The reminder agent found the invoice on PayPal"],
  get_invoice: ["The reminder agent is reading the invoice from PayPal", "The reminder agent read the invoice and the work on it from PayPal"],
};

const TONE: Record<TimelineStatus, PlainTone> = {
  pending: "working",
  running: "working",
  awaiting_approval: "waiting",
  succeeded: "done",
  failed: "stopped",
  denied: "stopped",
  skipped: "note",
  info: "note",
};

/** What PayPal did, by the operation the call made. Toolkit calls name the toolkit's method. */
const PAYPAL_WORDS: Record<string, [doing: string, done: string]> = {
  "invoicing.create": ["Making the invoice on PayPal", "PayPal made the invoice (a draft, not sent yet)"],
  "invoicing.update": ["Adding it to the PayPal invoice", "PayPal updated the invoice"],
  "invoicing.send": ["PayPal is sending the invoice", "PayPal sent the invoice to the customer"],
  "invoicing.get": ["Reading the invoice back from PayPal", "Read the invoice back from PayPal"],
  "invoicing.list": ["Reading your past PayPal invoices", "Read your past PayPal invoices"],
  "invoicing.remind": ["PayPal is sending the reminder", "PayPal sent the reminder"],
  "invoicing.cancel": ["Cancelling the invoice on PayPal", "Cancelled the invoice on PayPal"],
  "invoicing.delete": ["Deleting the draft on PayPal", "Deleted the draft on PayPal, so the customer got nothing"],
  "invoicing.generateNextNumber": ["Getting the next invoice number", "Got the next invoice number"],
  "toolkit.create_invoice": ["Making the invoice on PayPal", "PayPal made the invoice (a draft, not sent yet)"],
  "toolkit.send_invoice": ["PayPal is sending the invoice", "PayPal sent the invoice to the customer"],
  "toolkit.send_invoice_reminder": ["PayPal is sending the reminder", "PayPal sent the reminder"],
  "toolkit.get_invoice": ["Reading the invoice back from PayPal", "Read the invoice back from PayPal"],
  "toolkit.list_invoices": ["Reading your past PayPal invoices", "Read your past PayPal invoices"],
  "toolkit.search_invoicing": ["Searching PayPal for the invoice", "Found the invoice on PayPal"],
  "toolkit.cancel_sent_invoice": ["Cancelling the invoice on PayPal", "Cancelled the invoice on PayPal"],
};

const WEBHOOK_WORDS: Record<string, string> = {
  "INVOICING.INVOICE.PAID": "PayPal told us the customer paid",
  "INVOICING.INVOICE.REFUNDED": "PayPal told us the payment was refunded",
  "INVOICING.INVOICE.CANCELLED": "PayPal told us the invoice was cancelled",
  "INVOICING.INVOICE.CREATED": "PayPal confirmed the invoice exists",
  "INVOICING.INVOICE.SCHEDULED": "PayPal scheduled the invoice",
};

/**
 * The last word on what a person reads: PayPal's event names (INVOICING.INVOICE.PAID) and webhook
 * ids (WH-…) stay behind Details and on Activity, even when an error or the agent quotes them.
 */
export function plainWords(text: string): string {
  return text
    .replace(/[\s,]*\bWH-[A-Z0-9-]+/g, "")
    .replace(/\s*\(\s*\)/g, "")
    .replace(/\b[A-Z]+(?:\.[A-Z_]+)+\b/g, "PayPal's update")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function aiWords(step: TimelineStep): string | null {
  const t = step.title.toLowerCase();
  if (t.includes("extract")) return step.status === "succeeded" ? "AI read the line items from what you said" : "AI is reading the line items";
  if (t.includes("descri")) return step.status === "succeeded" ? "AI wrote what the customer reads" : "AI is writing what the customer reads";
  if (t.includes("speech") || t.includes("scribe")) return "Speech turned into words";
  if (step.status === "failed") return "The AI didn't finish";
  return null;
}

/** Why something stopped, in words a person can act on. */
export function plainStop(step: Pick<TimelineStep, "detail" | "error" | "approval">): string {
  const code = step.error?.name ?? "";
  const words = `${step.error?.message ?? ""} ${step.detail ?? ""}`;
  if (step.approval?.state === "denied" || code === "APPROVAL_DENIED") return "You declined, so nothing was sent";
  if (step.approval?.state === "expired" || code === "APPROVAL_EXPIRED") return "Nobody approved it in time, so nothing was sent";
  if (code === "COUNTERPARTY_NOT_ALLOWED" || /allowlist/i.test(words)) return "Stopped: this test site only sends to made-up @example.com addresses. Nothing was sent";
  if (/cap|limit/i.test(code)) return "Stopped: that's over the amount this app may send in one go. Nothing was sent";
  if (code === "DUPLICATE_IN_FLIGHT") return "That was already going through, so it wasn't sent twice";
  if (code === "BLOCKED_TOOL" || code === "DENIED_BY_GUARD") return "Stopped: this app isn't allowed to do that. Nothing was sent";
  const message = step.error?.message ?? step.detail;
  // A tool's own message can still name it (send_job_invoice); a person reads "this step".
  return message ? `Stopped: ${message.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, "this step").replace(/\.$/, "")}` : "Stopped before anything was sent";
}

export function plainStep(step: TimelineStep): PlainStep | null {
  const base = { id: step.stepId, tone: TONE[step.status], at: step.updatedAt };
  switch (step.kind) {
    case "paypal": {
      const words = PAYPAL_WORDS[step.paypal?.operation ?? ""];
      if (step.status === "failed") return { ...base, text: `PayPal said no: ${step.error?.message ?? "the call failed"}` };
      if (!words) return null;
      return { ...base, text: step.status === "succeeded" ? words[1] : words[0] };
    }
    case "ai": {
      const text = aiWords(step);
      return text ? { ...base, text } : null;
    }
    case "tool": {
      if (step.status === "denied" || step.status === "failed") return { ...base, text: plainStop(step) };
      if (step.status === "awaiting_approval") return { ...base, text: `${step.title}: waiting for you to approve` };
      if (step.tool?.name === "read_job_invoice") return step.status === "succeeded" ? { ...base, text: "The reminder agent read the invoice from PayPal" } : null;
      const read = step.tool?.source === "paypal-agent-toolkit" ? TOOLKIT_READS[step.tool.name] : undefined;
      if (read) return { ...base, text: step.status === "succeeded" ? read[1] : read[0], toolkit: step.tool!.name };
      return { ...base, text: step.status === "succeeded" ? `${step.title}: done` : step.title };
    }
    case "webhook": {
      const text = WEBHOOK_WORDS[step.title];
      return text ? { ...base, text, tone: "done" } : null;
    }
    case "agent.message":
      return step.detail ? { ...base, text: `Reminder agent: ${step.detail}`, tone: "note" } : null;
    case "run":
      if (step.status === "running") return { ...base, text: "The reminder agent is writing a note" };
      if (step.status === "failed") return { ...base, text: "The reminder agent stopped" };
      return null;
    default:
      return null;
  }
}

/** A PayPal read made inside a toolkit read: the toolkit step already says it. */
const READ_OPS = /^(invoicing\.(get|list)|toolkit\.(get_invoice|search_invoicing))$/;
function insideToolkitRead(step: TimelineStep, steps: TimelineStep[]): boolean {
  if (step.kind !== "paypal" || step.status === "failed" || !READ_OPS.test(step.paypal?.operation ?? "")) return false;
  return steps.some((tool) => tool.kind === "tool" && tool.tool?.source === "paypal-agent-toolkit" && !!TOOLKIT_READS[tool.tool.name] && tool.startedAt <= step.startedAt && step.startedAt <= tool.updatedAt);
}

export function plainSteps(steps: TimelineStep[]): PlainStep[] {
  return steps.flatMap((step) => {
    if (insideToolkitRead(step, steps)) return [];
    const plain = plainStep(step);
    return plain ? [{ ...plain, text: plainWords(plain.text) }] : [];
  });
}

const TOOL_WORDS: Record<string, string> = {
  send_job_invoice: "Invoice",
  send_payment_reminder: "Payment reminder",
};

const ACTION_WORDS: Partial<Record<AuditEntry["action"], string>> = {
  "approval.requested": "waiting for your approval",
  "approval.approved": "you approved it",
  "approval.denied": "you declined it, so nothing was sent",
  "approval.expired": "nobody approved it in time, so nothing was sent",
  "tool.executed": "PayPal did it",
  "tool.denied": "stopped before anything was sent",
  "tool.failed": "didn't go through",
};

/** One line of the audit log a person can read, or nothing for the bookkeeping steps in between. */
export function plainAudit(entry: AuditEntry): string | null {
  const read = entry.tool ? TOOLKIT_READS[entry.tool] : undefined;
  if (read) return entry.action === "tool.executed" ? `${read[1]}, through PayPal's Agent Toolkit.` : entry.action === "tool.failed" ? "The reminder agent couldn't read the invoice through PayPal's Agent Toolkit." : null;
  const what = entry.tool ? TOOL_WORDS[entry.tool] : undefined;
  const action = ACTION_WORDS[entry.action];
  if (!what || !action) return null;
  const amount = entry.amount ? ` for ${formatMoney(entry.amount)}` : "";
  const to = entry.counterparties?.length ? ` to ${entry.counterparties.join(", ")}` : "";
  return `${what}${entry.action === "approval.requested" ? `${amount}${to}` : ""}: ${action}.`;
}

