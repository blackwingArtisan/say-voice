import { describe, expect, it } from "vitest";
import { toMinor } from "@/lib/money";
import { MockPayPal } from "@/lib/paypal/mock";
import { readInvoice } from "@/lib/say/send";
import { payerLineCents } from "@/components/say/payer-view";

describe("what the customer sees on PayPal, read back from PayPal", () => {
  it("keeps PayPal's own lines: name, description, quantity, unit price and tax rate", async () => {
    const paypal = new MockPayPal();
    const draft = await paypal.invoicing.create({
      detail: { currency_code: "USD", note: "Dryer would not heat. 41 Elm St." },
      invoicer: { business_name: "Evans Appliance Repair" },
      primary_recipients: [{ billing_info: { email_address: "derek.evans@example.com" } }],
      items: [
        { name: "Labor", quantity: "0.75", unit_amount: { currency_code: "USD", value: "80.00" }, description: "Three quarters of an hour on the dryer" },
        { name: "Heating element", quantity: "1", unit_amount: { currency_code: "USD", value: "50.00" }, description: "New heating element", tax: { name: "Sales tax", percent: "7.25" } },
      ],
    });
    await paypal.invoicing.send(draft.id);
    const read = await readInvoice(draft.id, toMinor((await paypal.invoicing.get(draft.id)).amount.value, "USD"), paypal);
    expect(read.businessName).toBe("Evans Appliance Repair");
    expect(read.note).toBe("Dryer would not heat. 41 Elm St.");
    expect(read.items).toEqual([
      { name: "Labor", description: "Three quarters of an hour on the dryer", quantity: "0.75", unitCents: 8000 },
      { name: "Heating element", description: "New heating element", quantity: "1", unitCents: 5000, taxPercent: "7.25" },
    ]);
    expect(read.items!.map(payerLineCents)).toEqual([6000, 5000]);
    // Tax as PayPal worked it out: 7.25% of $50.00.
    expect(read.taxCents).toBe(363);
  });

  it("a line amount is PayPal's quantity times its unit price, in whole cents", () => {
    expect(payerLineCents({ name: "Labor", quantity: "1.5", unitCents: 7000 })).toBe(10500);
    expect(payerLineCents({ name: "Wire", quantity: "0.333", unitCents: 100 })).toBe(33);
  });
});
