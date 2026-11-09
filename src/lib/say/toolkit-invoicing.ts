/**
 * Invoicing through PayPal's Agent Toolkit (@paypal/agent-toolkit): its create_invoice,
 * send_invoice, send_invoice_reminder and generate_invoice_qr_code tools do the work, with the toolkit's own validators
 * and, on the sandbox, its own PayPalAPI client. The person's approval and the code's total check
 * sit in front of them, in the guarded tool that calls these (send_job_invoice, send_payment_reminder),
 * so the toolkit never runs without both. Server only.
 */
import { toolkitTools } from "@/lib/agent/tools/toolkit";
import type { AgentTool, ToolContext } from "@/lib/agent/tool";
import { QR_SIZE, qrPngFrom } from "@/lib/paypal/qr";
import type * as T from "@/lib/paypal/types";

const TOOLS = ["create_invoice", "send_invoice", "send_invoice_reminder", "generate_invoice_qr_code"] as const;
type ToolName = (typeof TOOLS)[number];

/** The toolkit's create_invoice takes flat fields. It has no payment term, so the due date goes on after. */
export function toolkitCreateArgs(req: T.CreateInvoiceRequest): Record<string, unknown> {
  return {
    currency_code: req.detail.currency_code,
    ...(req.detail.note ? { note: req.detail.note } : {}),
    ...(req.invoicer?.business_name ? { invoicer_business_name: req.invoicer.business_name } : {}),
    primary_recipients: req.primary_recipients,
    items: req.items,
  };
}

/** The new invoice's id: a full invoice (mock), or PayPal's link to it (the sandbox's minimal reply). */
export function createdId(result: unknown): string {
  const r = result as { id?: string; href?: string; response?: { id?: string; href?: string } } | null;
  const id = r?.id ?? r?.response?.id ?? (r?.href ?? r?.response?.href)?.split("/").pop();
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("PayPal's Agent Toolkit made the invoice but gave back no id, so nothing was sent.");
  return id;
}

export function toolkitInvoicing(ctx: ToolContext) {
  const tools = new Map(toolkitTools([...TOOLS], ctx.paypal.mode).map((tool) => [tool.name as ToolName, tool as AgentTool<Record<string, unknown>>]));
  // One PayPal-Request-Id per step, so a retry repeats that step only and the next step isn't mistaken for it.
  const run = (name: ToolName, args: Record<string, unknown>) => {
    const tool = tools.get(name)!;
    return tool.execute(tool.parse(args), { ...ctx, requestId: ctx.requestId ? `${ctx.requestId}-${name}` : ctx.requestId });
  };
  return {
    create: async (req: T.CreateInvoiceRequest) => createdId(await run("create_invoice", toolkitCreateArgs(req))),
    send: (invoiceId: string) => run("send_invoice", { invoice_id: invoiceId, send_to_recipient: true }),
    remind: (invoiceId: string, subject: string, note: string) => run("send_invoice_reminder", { invoice_id: invoiceId, subject, note }),
    /** PayPal's own QR code for the sent invoice (it opens PayPal's pay page), as a base64 PNG. */
    qr: async (invoiceId: string) => qrPngFrom(await run("generate_invoice_qr_code", { invoice_id: invoiceId, width: QR_SIZE, height: QR_SIZE })),
  };
}
