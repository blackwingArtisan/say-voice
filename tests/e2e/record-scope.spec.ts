/**
 * /api/audit and /api/paypal/ledger, like Activity: this browser's own jobs and the shared sample, nobody else's.
 * Opening "For judges" shows the whole record, with real addresses still hidden.
 */
import { expect, test } from "@playwright/test";
import { WHOLE_RECORD, keepToOneCall, kitStatus, sentSample, visitorHeaders } from "./flow";

interface Ledger { entries: { paypalId: string; parentId?: string; orderId?: string }[]; scope: string }
interface Audit { entries: { runId?: string }[]; scope: string; integrity: { ok: boolean } }

test("the audit log and the PayPal ledger show this browser's own jobs; For judges opens the whole record", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(keepToOneCall(live), "spends on the one mic clip only");
  const sent = await sentSample(page, request);
  const invoiceId = sent.invoice!.id;
  const read = async <T>(path: string, headers: Record<string, string>) => (await (await request.get(path, { headers })).json()) as T;
  const hasInvoice = (ledger: Ledger) => ledger.entries.some((e) => [e.paypalId, e.parentId, e.orderId].includes(invoiceId));

  // This browser: its own invoice and its own runs, and nothing else.
  const mine = await visitorHeaders(page);
  const myJobs = ((await (await request.get("/api/jobs", { headers: mine })).json()) as { jobs: { invoice?: { id: string }; runId?: string }[] }).jobs;
  const myInvoices = new Set(myJobs.flatMap((job) => (job.invoice ? [job.invoice.id] : [])));
  const ledger = await read<Ledger>("/api/paypal/ledger", mine);
  expect(ledger.scope).toBe("this browser");
  expect(hasInvoice(ledger)).toBe(true);
  const sample = (await (await request.get("/api/jobs/job_sample")).json()) as { invoice?: { id: string } };
  for (const entry of ledger.entries) expect([...myInvoices, sample.invoice?.id].some((id) => !!id && [entry.paypalId, entry.parentId, entry.orderId].includes(id)), `ledger entry ${entry.paypalId}`).toBe(true);
  const audit = await read<Audit>("/api/audit", mine);
  expect(audit.entries.some((e) => e.runId === sent.runId)).toBe(true);
  expect(audit.integrity.ok).toBe(true);

  // Another browser, or a plain request with no visitor: not this job's invoice, not its runs.
  for (const other of [{ "x-say-visitor": "v_someoneelse01" }, {}] as Record<string, string>[]) {
    expect(hasInvoice(await read<Ledger>("/api/paypal/ledger", other))).toBe(false);
    expect((await read<Audit>("/api/audit", other)).entries.some((e) => e.runId === sent.runId)).toBe(false);
  }

  // For judges, opened in the app, sets the cookie: the whole record, from the browser itself.
  await page.getByTestId("for-judges-toggle").first().click();
  const whole = (await (await page.request.get("/api/paypal/ledger")).json()) as Ledger;
  expect(whole.scope).toBe("whole record");
  expect(hasInvoice(whole)).toBe(true);
  expect(whole.entries.length).toBeGreaterThanOrEqual(ledger.entries.length);
  const all = await read<Audit>("/api/audit", WHOLE_RECORD);
  expect(all.scope).toBe("whole record");
  expect(all.entries.length).toBeGreaterThanOrEqual(audit.entries.length);
  console.log(`Ledger scope: this browser ${ledger.entries.length} entries (invoice ${invoiceId}), another browser none of them, For judges ${whole.entries.length}; audit ${audit.entries.length} of ${all.entries.length}`);
});
