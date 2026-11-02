import { route } from "@/lib/http";
import { getMockPayPal } from "@/lib/paypal";

/** The mock's stand-in for a customer paying. In sandbox a person pays on PayPal's own page. */
export const POST = route<RouteContext<"/api/dev/pay-invoice/[id]">>(
  async (_req, ctx) => {
    const invoice = await getMockPayPal()!.simulateInvoicePayment((await ctx.params).id);
    return { status: invoice.status };
  },
  { mockOnly: true },
);
