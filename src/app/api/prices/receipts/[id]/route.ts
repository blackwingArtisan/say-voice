import { HttpError, route } from "@/lib/http";
import { getPayPal } from "@/lib/paypal";
import { readForHistory } from "@/lib/say/paypal-history";

/**
 * One of the PayPal invoices the price book was read from, read again from PayPal now
 * (GET /v2/invoicing/invoices/{id}). Only those invoices, and nothing about the customer. A plain
 * link opens it, so there's no visitor header: any price book's invoices will do, as they're all the trade's.
 */
export const GET = route<RouteContext<"/api/prices/receipts/[id]">>(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!readForHistory(id)) throw new HttpError(404, "That isn't one of the PayPal invoices your price book was read from.");
  const invoice = await getPayPal().invoicing.get(id);
  return {
    readFrom: `GET /v2/invoicing/invoices/${id}`,
    id: invoice.id,
    number: invoice.detail.invoice_number,
    status: invoice.status,
    date: invoice.detail.invoice_date,
    from: invoice.invoicer?.business_name,
    items: (invoice.items ?? []).map((item) => ({ name: item.name, quantity: item.quantity, price: item.unit_amount.value })),
    total: invoice.amount?.value,
    currency: invoice.amount?.currency_code,
  };
});
