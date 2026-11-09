import { describe, expect, it } from "vitest";
import { fromInvoices } from "../../demo/captions";

describe("the demo's price caption", () => {
  it("quotes the price row without its trailing comma, so the caption doesn't read \"$50.00,.\"", () => {
    expect(fromInvoices("Heating element\n$50.00\nfrom 9 PayPal invoices, last $50.00, and 1 sent here")).toBe("from 9 PayPal invoices, last $50.00");
    expect(fromInvoices("from 1 PayPal invoice, last $1,250.00.")).toBe("from 1 PayPal invoice, last $1,250.00");
    expect(`Heating element: ${fromInvoices("from 9 PayPal invoices, last $50.00, and 1 sent here")}.`).not.toMatch(/,\./);
  });

  it("falls back to plain words when the row has no PayPal history", () => {
    expect(fromInvoices("Heating element $50.00 usual price")).toBe("from your PayPal invoices");
  });
});
