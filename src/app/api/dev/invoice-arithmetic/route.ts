import { z } from "zod";
import { readJson, route } from "@/lib/http";
import { getMockPayPal } from "@/lib/paypal";

/** Mock mode only: the next invoice PayPal drafts comes out { cents } off its items, to show the total check. */
export const POST = route(
  async (req) => {
    const { cents } = await readJson(req, z.object({ cents: z.number().int() }));
    getMockPayPal()!.simulateInvoiceArithmetic(cents);
    return { ok: true, cents };
  },
  { mockOnly: true },
);
