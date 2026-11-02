/** Reads the PayPal sandbox directly, so the checks don't depend on the app under test. */
import { loadEnvFiles } from "../../src/lib/env-core";

const API = "https://api-m.sandbox.paypal.com";

export interface PayPalInvoice {
  id: string;
  status: string;
  amount: { currency_code: string; value: string };
  detail: { invoice_number: string; currency_code: string; payment_term?: { term_type: string; due_date?: string } };
  primary_recipients: { billing_info: { email_address: string } }[];
  items: { name: string; quantity: string; unit_amount: { value: string } }[];
}

async function token(): Promise<string> {
  loadEnvFiles();
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!res.ok) throw new Error(`PayPal token request failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function readInvoiceFromPayPal(invoiceId: string): Promise<PayPalInvoice> {
  const res = await fetch(`${API}/v2/invoicing/invoices/${invoiceId}`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!res.ok) throw new Error(`GET invoice failed: ${res.status}`);
  return (await res.json()) as PayPalInvoice;
}
