/**
 * npm run seed:history: puts the demo trade's past invoices (src/lib/demo/past-invoices.ts) on the
 * PayPal sandbox, for "Learn from my PayPal invoices" to read back. Sandbox only; mock PayPal gets
 * them on first use. Running it again adds nothing. --refresh makes a new set, so it is the newest
 * on the shared sandbox account again.
 */
import { loadEnvFiles } from "../src/lib/env-core";
import { getEnv } from "../src/lib/env";
import { getPayPal } from "../src/lib/paypal";
import { readHistoryManifest, seedPastInvoices, writeHistoryManifest } from "../src/lib/demo/past-invoices";

async function main() {
  loadEnvFiles();
  if (getEnv().paypalMode !== "sandbox") throw new Error("Set PAYPAL_MODE=sandbox: mock PayPal gets these on first use.");
  const manifest = process.argv.includes("--refresh") ? {} : readHistoryManifest();
  const result = await seedPastInvoices(getPayPal(), manifest, () => writeHistoryManifest(manifest));
  writeHistoryManifest(manifest);
  console.log(`Created ${result.created}, reused ${result.reused}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
