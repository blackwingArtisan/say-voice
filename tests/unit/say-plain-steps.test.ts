import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/lib/agent/audit";
import type { TimelineStep } from "@/lib/events/types";
import { plainAudit, plainStep, plainSteps, plainStop } from "@/lib/say/plain-steps";

const at = "2026-11-08T12:00:00.000Z";
const step = (s: Partial<TimelineStep>): TimelineStep => ({ id: "e", stepId: s.stepId ?? Math.random().toString(36), channel: "c", ts: at, startedAt: at, updatedAt: at, history: [], kind: "info", status: "succeeded", title: "", ...s });

/** What the send of the sample job puts on the timeline, technical words and all. */
const sendTimeline: TimelineStep[] = [
  step({ kind: "ai", title: "Extract line items", subtitle: "claude · worst case $0.0633 reserved", detail: "$0.0041 spent" }),
  step({ kind: "guard", title: "Guard", detail: "send_job_invoice always requires human approval." }),
  step({ kind: "tool", title: "Send the invoice", status: "awaiting_approval", tool: { name: "send_job_invoice", source: "app" } }),
  step({ kind: "approval", title: "Approval", status: "succeeded", approval: { id: "a", state: "approved" } }),
  step({ kind: "paypal", title: "Create draft invoice", subtitle: "POST /v2/invoicing/invoices", paypal: { operation: "invoicing.create", method: "POST", path: "/v2/invoicing/invoices", mode: "sandbox", debugId: "f158abc" } }),
  step({ kind: "paypal", title: "Send invoice", subtitle: "POST /v2/invoicing/invoices/x/send", paypal: { operation: "invoicing.send", method: "POST", path: "/v2/invoicing/invoices/x/send", mode: "sandbox", debugId: "f159abc" } }),
  step({ kind: "paypal", title: "Agent Toolkit · send_invoice", paypal: { operation: "toolkit.send_invoice", method: "POST", path: "/v2/invoicing/invoices/x/send", mode: "sandbox" } }),
  step({ kind: "webhook", title: "INVOICING.INVOICE.PAID" }),
  step({ kind: "tool", title: "Send the invoice", status: "denied", tool: { name: "send_job_invoice", source: "app" }, error: { name: "COUNTERPARTY_NOT_ALLOWED", message: "Not on the payee allowlist: real.person@gmail.com." } }),
];

const TECHNICAL = /send_job_invoice|allowlist|debug|reserved|POST|\/v2\/|Guard|toolkit|INVOICING\.|hash/i;

describe("the timeline in plain words", () => {
  it("keeps tool names, endpoints, debug ids, the AI's cost and the guard's rules out", () => {
    const plain = plainSteps(sendTimeline);
    expect(plain.length).toBeGreaterThan(4);
    for (const p of plain) expect(p.text).not.toMatch(TECHNICAL);
    expect(plain.map((p) => p.text)).toEqual([
      "AI read the line items from what you said",
      "Send the invoice: waiting for you to approve",
      "PayPal made the invoice (a draft, not sent yet)",
      "PayPal sent the invoice to the customer",
      "PayPal sent the invoice to the customer",
      "PayPal says the customer paid",
      "Stopped: this test site only sends to made-up @example.com addresses. Nothing was sent",
    ]);
  });

  it("says why something stopped in words a person can act on", () => {
    expect(plainStop({ approval: { id: "a", state: "denied" } })).toBe("You declined, so nothing was sent");
    expect(plainStop({ error: { name: "APPROVAL_EXPIRED", message: "x" } })).toContain("in time");
    expect(plainStop({ error: { name: "DAILY_CAP_EXCEEDED", message: "Daily cap of $500 reached" } })).toContain("over the amount");
    expect(plainStop({ error: { name: "Error", message: "PayPal shows $12.00, not the approved $11.00." } })).toBe("Stopped: PayPal shows $12.00, not the approved $11.00");
  });

  it("names what PayPal refused without the error code", () => {
    const failed = plainStep(step({ kind: "paypal", status: "failed", paypal: { operation: "invoicing.send", method: "POST", path: "/x", mode: "sandbox" }, error: { name: "UNPROCESSABLE_ENTITY", message: "A cancelled invoice cannot be sent.", debugId: "abc" } }));
    expect(failed?.text).toBe("PayPal said no: A cancelled invoice cannot be sent.");
    expect(failed?.tone).toBe("stopped");
  });
});

describe("the record in plain words", () => {
  const entry = (e: Partial<AuditEntry>): AuditEntry => ({ seq: 1, ts: at, actor: "tradesperson", prevHash: "0", hash: "1", action: "tool.executed", ...e });

  it("reads like what happened, and skips the bookkeeping", () => {
    expect(plainAudit(entry({ action: "approval.requested", tool: "send_job_invoice", amount: { currency_code: "USD", value: "110.00" }, counterparties: ["derek.evans@example.com"] }))).toBe("Invoice for $110.00 to derek.evans@example.com: waiting for your approval.");
    expect(plainAudit(entry({ action: "tool.denied", tool: "send_job_invoice", reason: "Not on the payee allowlist" }))).toBe("Invoice: stopped before anything was sent.");
    expect(plainAudit(entry({ action: "approval.approved", tool: "send_payment_reminder" }))).toBe("Payment reminder: you approved it.");
    expect(plainAudit(entry({ action: "tool.requested" as AuditEntry["action"], tool: "send_job_invoice" }))).toBeNull();
    expect(plainAudit(entry({ action: "tool.executed", tool: "some_other_tool" }))).toBeNull();
  });
});
