/**
 * npm run seed:history: puts the demo trade's past invoices (src/lib/demo/past-invoices.ts) on the
 * PayPal sandbox, for "Learn from my PayPal invoices" to read back. Sandbox only; mock PayPal gets
 * them on first use. Running it again adds nothing. --refresh makes a new set, so it is the newest
 * on the shared sandbox account again.
 */
import { loadEnvFiles } from "../src/lib/env-core";
import { getEnv } from "../src/lib/env";
import { getPayPal } from "../src/lib/paypal";
import { readHistoryManifest, RETIRED_PAST_INVOICES, seedPastInvoices, writeHistoryManifest } from "../src/lib/demo/past-invoices";
import { SANDBOX_API_BASE, SandboxPayPal } from "../src/lib/paypal/sandbox";

/**
 * Cancels the replaced copies of past jobs, so Learn reads each job once. A paid copy has a check
 * payment recorded on it, which PayPal must delete before it can be cancelled
 * (DELETE /v2/invoicing/invoices/{id}/payments/{transaction_id}). Running it again changes nothing.
 */
async function retire(clientId: string, clientSecret: string) {
  const pp = getPayPal();
  const raw = new SandboxPayPal({ clientId, clientSecret });
  let cancelled = 0;
  for (const id of RETIRED_PAST_INVOICES) {
    const invoice = await pp.invoicing.get(id);
    if (invoice.status === "CANCELLED") continue;
    for (const payment of invoice.payments?.transactions ?? []) {
      if (payment.type === "PAYPAL" || !payment.payment_id) continue;
      const res = await fetch(`${SANDBOX_API_BASE}/v2/invoicing/invoices/${id}/payments/${payment.payment_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await raw.getAccessToken()}` } });
      if (!res.ok) throw new Error(`Deleting the recorded payment on ${id} failed: ${res.status}`);
    }
    await pp.invoicing.cancel(id, { send_to_recipient: false, send_to_invoicer: false });
    cancelled++;
  }
  return cancelled;
}

async function main() {
  loadEnvFiles();
  if (getEnv().paypalMode !== "sandbox") throw new Error("Set PAYPAL_MODE=sandbox: mock PayPal gets these on first use.");
  const manifest = process.argv.includes("--refresh") ? {} : readHistoryManifest();
  const result = await seedPastInvoices(getPayPal(), manifest, () => writeHistoryManifest(manifest));
  writeHistoryManifest(manifest);
  const env = getEnv();
  const cancelled = await retire(env.paypalClientId!, env.paypalClientSecret!);
  console.log(`Created ${result.created}, reused ${result.reused}, cancelled ${cancelled} replaced copies.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
