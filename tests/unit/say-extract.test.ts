import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { invoiceRequest } from "@/agents/tools/send-job-invoice";
import { extractJob, InvoiceSchema, SYSTEM, toJobFields } from "@/lib/say/extract";
import { computeTotals } from "@/lib/say/money";
import { SAMPLE_AMOUNTS, SAMPLE_EXTRACTION, SAMPLE_TRANSCRIPT } from "@/lib/say/sample";
import { transcribe } from "@/lib/say/speech";
import { heardFor } from "@/lib/say/spoken";

describe("the frozen extraction prompt", () => {
  it("is byte for byte the one tested on the sealed sets", () => {
    expect(createHash("sha256").update(SYSTEM).digest("hex")).toBe("e22c8bb05c5c7a215e6054ef207b1ee034d4987b3a867734f7ff4e122838cabf");
  });

  it("keeps the schema fields it was tested with", () => {
    expect(Object.keys(InvoiceSchema.shape)).toEqual(["customer", "service_address", "line_items", "tax_rate", "total", "uncertain"]);
  });
});

describe("the sample job", () => {
  it("is a valid extraction whose amounts match the one constant", () => {
    const fields = toJobFields(InvoiceSchema.parse(SAMPLE_EXTRACTION));
    expect(fields.lines.map((l) => l.unitCents)).toEqual([8000, SAMPLE_AMOUNTS.heardElementCents]);
    const totals = computeTotals(fields.lines, fields.taxRateMilli);
    expect(totals.lines[0].lineCents).toBe(SAMPLE_AMOUNTS.laborCents);
    expect(totals.totalCents).toBe(SAMPLE_AMOUNTS.heardTotalCents);
  });

  it("flags the heating element by row", () => {
    const fields = toJobFields(SAMPLE_EXTRACTION);
    expect(fields.flags).toHaveLength(1);
    expect(fields.flags[0].lineKey).toBe(fields.lines[1].key);
  });

  it("shows the words beside each price", () => {
    const fields = toJobFields(SAMPLE_EXTRACTION);
    expect(fields.lines.map((l) => heardFor(SAMPLE_TRANSCRIPT, l))).toEqual([expect.stringContaining("at eighty an hour"), expect.stringContaining("make that fifteen dollars")]);
  });

  it("ignores the AI's stated total", () => {
    const fields = toJobFields({ ...SAMPLE_EXTRACTION, total: 999_999 });
    expect(computeTotals(fields.lines, fields.taxRateMilli).totalCents).toBe(SAMPLE_AMOUNTS.heardTotalCents);
  });
});

describe("mock mode", () => {
  it("runs speech and extraction with no keys", async () => {
    const speech = await transcribe(new ArrayBuffer(8), "audio/webm;codecs=opus");
    expect(speech).toMatchObject({ mocked: true, transcript: SAMPLE_TRANSCRIPT });
    const job = await extractJob(speech.transcript);
    expect(job.ai).toMatchObject({ mocked: true, costUsd: 0 });
    expect(job.lines).toHaveLength(2);
  });
});

describe("the PayPal invoice request", () => {
  const input = { customer_name: "Mary Jane Watson", customer_email: "mj@example.com", lines: [{ name: "Labor", quantityMilli: 750, unitCents: 8000 }], tax_rate_milli: 7250, due_date: "2026-11-15", total_cents: 6435, idempotency_key: "job" };

  it("sends quantities, prices and tax as PayPal strings", () => {
    const request = invoiceRequest(input);
    expect(request.items[0]).toEqual({ name: "Labor", quantity: "0.75", unit_amount: { currency_code: "USD", value: "80.00" }, tax: { name: "Sales tax", percent: "7.25" } });
    expect(request.detail.payment_term).toEqual({ term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-11-15" });
    expect(request.primary_recipients![0].billing_info).toMatchObject({ name: { given_name: "Mary", surname: "Jane Watson" }, email_address: "mj@example.com" });
  });

  it("leaves tax off a no-tax job", () => {
    expect(invoiceRequest({ ...input, tax_rate_milli: 0 }).items[0].tax).toBeUndefined();
  });

  it("never sets an invoice date, which could schedule the send", () => {
    expect(invoiceRequest(input).detail.invoice_date).toBeUndefined();
  });
});
