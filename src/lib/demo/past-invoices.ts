/**
 * The demo trade's past PayPal invoices, from before it used this app: 23 jobs over the last four
 * months, to made-up example.com customers. Illustrative: the jobs, names and prices are invented
 * for the demo, in line with the sample job's prices. A heating element went for $47.50 to $55.00
 * over them (the usual is still $50.00), and the later jobs fall on uneven days, as real ones do. A thermal
 * fuse went on 8 of the 10 heating-element jobs, so a job that names the element and not the fuse gets
 * "usually with" (p01, p05, p12, p15, p18 and p21 gained the fuse on 2026-11-09: they were sent again
 * as new invoices, and the first ones cancelled, so the sandbox holds one copy of each job). `npm run seed:history` puts them on the
 * sandbox once (their ids go in src/lib/demo/past-invoices.json, so a second run adds nothing); mock PayPal
 * gets them on first use. "Learn from my PayPal invoices" then reads them back with
 * GET /v2/invoicing/invoices like any other invoice. Server only.
 */
import fs from "node:fs";
import path from "node:path";
import { appConfig } from "@/app.config";
import { isPayPalError, type PayPalApi } from "@/lib/paypal";
import type * as T from "@/lib/paypal/types";

type Line = [name: string, quantity: string, price: string];

interface PastJob {
  key: string;
  customer: { given: string; surname: string; email: string };
  daysAgo: number;
  note: string;
  lines: Line[];
  /** Paid by check a few days later; the rest are still open. */
  paid: boolean;
}

const c = (given: string, surname: string) => ({ given, surname, email: `${given}.${surname}`.toLowerCase() + "@example.com" });

export const PAST_JOBS: PastJob[] = [
  { key: "p01", customer: c("Nina", "Patel"), daysAgo: 118, note: "Dryer would not heat: new heating element and thermal fuse", lines: [["Service call", "1", "95.00"], ["Heating element", "1", "50.00"], ["Thermal fuse", "1", "18.00"]], paid: true },
  { key: "p02", customer: c("Omar", "Haddad"), daysAgo: 111, note: "Washer would not drain: new drain pump", lines: [["Labor", "1", "80.00"], ["Drain pump", "1", "85.00"]], paid: true },
  { key: "p03", customer: c("Grace", "Okafor"), daysAgo: 104, note: "Oven not holding temperature: new thermostat", lines: [["Labor", "0.75", "80.00"], ["Thermostat", "1", "65.00"]], paid: true },
  { key: "p04", customer: c("Luis", "Romero"), daysAgo: 97, note: "Dryer drum not turning: new belt", lines: [["Service call", "1", "95.00"], ["Dryer belt", "1", "24.00"]], paid: true },
  { key: "p05", customer: c("Hannah", "Weiss"), daysAgo: 90, note: "Dryer not heating: heating element and thermal fuse replaced", lines: [["Labor", "1", "80.00"], ["Heating element", "1", "50.00"], ["Thermal fuse", "1", "18.00"]], paid: true },
  { key: "p06", customer: c("Kenji", "Mori"), daysAgo: 84, note: "Gas oven slow to light: new igniter", lines: [["Labor", "1", "80.00"], ["Igniter", "1", "42.00"]], paid: true },
  { key: "p07", customer: c("Amara", "Diallo"), daysAgo: 77, note: "Washer leaking at the door: new door gasket", lines: [["Labor", "1.5", "80.00"], ["Door gasket", "1", "58.00"]], paid: true },
  { key: "p08", customer: c("Peter", "Lindqvist"), daysAgo: 70, note: "Washer not filling: new water inlet valve", lines: [["Service call", "1", "95.00"], ["Water inlet valve", "1", "46.00"]], paid: true },
  { key: "p09", customer: c("Rosa", "Alvarez"), daysAgo: 63, note: "Dryer would not heat: new heating element and thermal fuse", lines: [["Labor", "1", "80.00"], ["Heating element", "1", "50.00"], ["Thermal fuse", "1", "18.00"]], paid: true },
  { key: "p10", customer: c("Sam", "Whitaker"), daysAgo: 56, note: "Washer would not drain: drain pump swapped", lines: [["Labor", "1", "80.00"], ["Drain pump", "1", "85.00"]], paid: true },
  { key: "p11", customer: c("Ivy", "Chen"), daysAgo: 49, note: "Dryer squealing: new belt and idler pulley", lines: [["Labor", "1", "80.00"], ["Dryer belt", "1", "24.00"], ["Idler pulley", "1", "28.00"]], paid: true },
  { key: "p12", customer: c("Marcus", "Bell"), daysAgo: 42, note: "Dryer would not heat: heating element, blown thermal fuse", lines: [["Service call", "1", "95.00"], ["Heating element", "1", "52.00"], ["Thermal fuse", "1", "18.00"]], paid: true },
  { key: "p13", customer: c("Leah", "Novak"), daysAgo: 35, note: "Oven not heating: thermostat replaced", lines: [["Labor", "1", "80.00"], ["Thermostat", "1", "65.00"]], paid: true },
  { key: "p14", customer: c("Diego", "Santos"), daysAgo: 28, note: "Gas range burner not lighting: new igniter", lines: [["Service call", "1", "95.00"], ["Igniter", "1", "42.00"]], paid: true },
  { key: "p15", customer: c("Freya", "Olsen"), daysAgo: 21, note: "Dryer not heating: heating element and thermal fuse replaced, vent cleared", lines: [["Labor", "1.25", "80.00"], ["Heating element", "1", "50.00"], ["Thermal fuse", "1", "18.00"]], paid: true },
  { key: "p16", customer: c("Tariq", "Aziz"), daysAgo: 14, note: "Washer not draining: new drain pump", lines: [["Labor", "1", "80.00"], ["Drain pump", "1", "85.00"]], paid: false },
  { key: "p17", customer: c("Chloe", "Dubois"), daysAgo: 9, note: "Washer not filling: water inlet valve", lines: [["Labor", "1", "80.00"], ["Water inlet valve", "1", "46.00"]], paid: false },
  { key: "p18", customer: c("Ben", "Kowalski"), daysAgo: 5, note: "Dryer would not heat: new heating element and thermal fuse", lines: [["Service call", "1", "95.00"], ["Heating element", "1", "50.00"], ["Thermal fuse", "1", "18.00"]], paid: false },
  // Added later, so the sandbox keeps the first 18 as they were sent.
  { key: "p19", customer: c("Wes", "Harlow"), daysAgo: 81, note: "Dryer would not heat: element and thermal fuse, after-hours call", lines: [["Service call", "1", "110.00"], ["Heating element", "1", "55.00"], ["Thermal fuse", "1", "18.00"]], paid: true },
  { key: "p20", customer: c("Mina", "Sato"), daysAgo: 66, note: "Dryer not heating: heating element (customer's own part order fell through)", lines: [["Labor", "1", "80.00"], ["Heating element", "1", "47.50"]], paid: true },
  { key: "p21", customer: c("Owen", "Pryce"), daysAgo: 38, note: "Stacked dryer not heating: heating element and thermal fuse, hard to reach", lines: [["Labor", "1.5", "80.00"], ["Heating element", "1", "54.00"], ["Thermal fuse", "1", "18.00"]], paid: true },
  { key: "p22", customer: c("Lena", "Fischer"), daysAgo: 25, note: "Dryer would not heat: heating element", lines: [["Service call", "1", "95.00"], ["Heating element", "1", "49.00"]], paid: true },
  { key: "p23", customer: c("Abe", "Morales"), daysAgo: 17, note: "Washer not filling: water inlet valve", lines: [["Labor", "0.75", "80.00"], ["Water inlet valve", "1", "46.00"]], paid: false },
];

const usd = (value: string) => ({ currency_code: "USD", value });
const dayOf = (now: Date, daysAgo: number) => new Date(now.getTime() - daysAgo * 864e5).toISOString().slice(0, 10);
const plus = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 864e5).toISOString().slice(0, 10);

export function pastInvoiceRequest(job: PastJob, now = new Date()): T.CreateInvoiceRequest {
  const date = dayOf(now, job.daysAgo);
  return {
    detail: { currency_code: "USD", invoice_date: date, payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: plus(date, 14) }, note: job.note },
    invoicer: { business_name: appConfig.tradeName },
    primary_recipients: [{ billing_info: { name: { given_name: job.customer.given, surname: job.customer.surname }, email_address: job.customer.email } }],
    items: job.lines.map(([name, quantity, price]) => ({ name, quantity, unit_amount: usd(price), item_date: date })),
  };
}

/**
 * The first copies of the jobs that gained a thermal fuse (see above). `npm run seed:history` cancels
 * them, after deleting the check payment recorded on the paid ones, so Learn never counts a job twice.
 */
export const RETIRED_PAST_INVOICES: string[] = ["INV2-SGDU-RVQJ-2CM5-HY3Q", "INV2-R7UN-2LTS-C2CX-V3PH", "INV2-XYJ3-2YSF-ST46-C89U", "INV2-PWS4-U2CV-NBAQ-H5TU", "INV2-DAPA-XB4K-LPBL-M94A", "INV2-B5BF-SZCX-BUNJ-9KB9"];

export type HistoryManifest = Record<string, string>;

/** Creates what's missing, sends it, and records the check for the paid ones. Running it again adds nothing. */
export async function seedPastInvoices(pp: PayPalApi, manifest: HistoryManifest, save: () => void = () => {}, now = new Date()) {
  let created = 0;
  let reused = 0;
  for (const job of PAST_JOBS) {
    let invoice: T.Invoice | null = null;
    if (manifest[job.key]) {
      invoice = await pp.invoicing.get(manifest[job.key]).catch((e) => {
        if (isPayPalError(e) && (e.status === 404 || e.status === 403)) return null;
        throw e;
      });
    }
    if (invoice) reused++;
    else {
      invoice = await pp.invoicing.create(pastInvoiceRequest(job, now));
      manifest[job.key] = invoice.id;
      save();
      created++;
    }
    if (invoice.status === "DRAFT") {
      await pp.invoicing.send(invoice.id, { send_to_recipient: false });
      invoice = await pp.invoicing.get(invoice.id);
    }
    if (job.paid && (invoice.status === "SENT" || invoice.status === "UNPAID")) {
      await pp.invoicing.recordPayment(invoice.id, { method: "CHECK", payment_date: plus(invoice.detail.invoice_date ?? dayOf(now, job.daysAgo), 4), amount: invoice.amount, note: "Paid by check" });
    }
  }
  return { created, reused };
}

const MANIFEST = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), "src/lib/demo/past-invoices.json");

export function readHistoryManifest(file = MANIFEST()): HistoryManifest {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

export function writeHistoryManifest(manifest: HistoryManifest, file = MANIFEST()) {
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}
