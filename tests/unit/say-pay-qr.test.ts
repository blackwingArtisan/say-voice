import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { MockPayPal } from "@/lib/paypal/mock";
import { QR_SIZE, qrPngFrom } from "@/lib/paypal/qr";
import { OPERATIONS } from "@/lib/paypal/operations";
import { payQrFor } from "@/lib/say/pay-qr";
import { plainStep } from "@/lib/say/plain-steps";

// jsQR reads the code the way a phone camera would; pngjs (qrcode's own PNG library) unpacks the image.
const require = createRequire(import.meta.url);
const jsQR = require("jsqr") as (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
const { PNG } = require("pngjs") as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };
const decode = (base64: string) => {
  const png = PNG.sync.read(Buffer.from(base64, "base64"));
  return { width: png.width, height: png.height, url: jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data };
};

async function sent(paypal: MockPayPal, send = true) {
  const draft = await paypal.invoicing.create({
    detail: { currency_code: "USD" },
    primary_recipients: [{ billing_info: { email_address: "derek.evans@example.com" } }],
    items: [{ name: "Heating element", quantity: "1", unit_amount: { currency_code: "USD", value: "50.00" } }],
  });
  if (send) await paypal.invoicing.send(draft.id);
  return draft.id;
}

const ctx = (paypal: MockPayPal) => ({ runId: "run_qr", actor: "tradesperson", paypal, idempotencyKey: "job_qr-qr", requestId: "job_qr-qr" });

describe("PayPal's QR code for a sent invoice", () => {
  it("is POST /v2/invoicing/invoices/{id}/generate-qr-code", () => {
    expect(OPERATIONS["invoicing.generateQrCode"]).toMatchObject({ method: "POST", path: "/v2/invoicing/invoices/{id}/generate-qr-code" });
  });

  it("takes the PNG out of PayPal's multipart answer, or a bare base64 one", () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsAQAAAABRBrPYAAABJRU5ErkJggg==";
    const multipart = `--27b49eee\r\nContent-Disposition: form-data; name="image"\r\nContent-Type: text/plain\r\n\r\n${png.slice(0, 30)}\r\n${png.slice(30)}\r\n--27b49eee--`;
    expect(qrPngFrom(multipart)).toBe(png);
    expect(qrPngFrom(png)).toBe(png);
    expect(() => qrPngFrom({ name: "NOT_ACCEPTABLE" })).toThrow(/no PNG/);
    expect(() => qrPngFrom("<html>")).toThrow(/no PNG/);
  });

  it("comes through PayPal's Agent Toolkit and opens PayPal's pay page for that invoice", async () => {
    const paypal = new MockPayPal();
    const id = await sent(paypal);
    const qr = await payQrFor(id, ctx(paypal));
    expect(qr.source).toBe("paypal");
    const read = decode((qr as { png: string }).png);
    expect(read.url).toBe(`https://www.sandbox.paypal.com/invoice/payerView/details/${id}?qr=1`);
    expect(read.width).toBe(QR_SIZE);
  });

  it("when PayPal errors, says why, so the screen draws its own from PayPal's link and says so", async () => {
    const paypal = new MockPayPal();
    const draft = await sent(paypal, false);
    const qr = await payQrFor(draft, ctx(paypal));
    expect(qr).toMatchObject({ source: "local", why: expect.stringMatching(/INVALID_INVOICE_STATUS/) });
    expect((await payQrFor("INV2-NOPE-NOPE-NOPE-NOPE", ctx(paypal))).source).toBe("local");
  });

  it("is said in plain words on the timeline", () => {
    const step = { id: "s1", kind: "paypal", title: "Agent Toolkit · generate_invoice_qr_code", status: "succeeded", startedAt: "2026-11-09T12:00:00.000Z", paypal: { operation: "toolkit.generate_invoice_qr_code", method: "TOOLKIT", path: "generate_invoice_qr_code", mode: "sandbox" } };
    expect(plainStep(step as never)?.text).toBe("PayPal made the QR code the customer scans to pay");
  });
});
