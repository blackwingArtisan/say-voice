/**
 * The pay-now QR on the result screen comes from PayPal: the Agent Toolkit's
 * generate_invoice_qr_code (POST /v2/invoicing/invoices/{id}/generate-qr-code), which encodes
 * PayPal's own pay page for the invoice. Only if PayPal errors does the screen draw one itself, from
 * PayPal's link for the invoice, and it says so. Server only.
 */
import type { ToolContext } from "@/lib/agent/tool";
import { toolkitInvoicing } from "./toolkit-invoicing";
import type { PayQr } from "./types";

export async function payQrFor(invoiceId: string, ctx: ToolContext): Promise<PayQr> {
  const at = new Date().toISOString();
  try {
    return { source: "paypal", png: await toolkitInvoicing(ctx).qr(invoiceId), at };
  } catch (e) {
    return { source: "local", why: e instanceof Error ? e.message : String(e), at };
  }
}
