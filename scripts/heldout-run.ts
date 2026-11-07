/**
 * Runs the sealed held-out transcripts (tests/heldout) through the real job pipeline: the frozen
 * extraction, the tax rules and the description step, then the confirm screen's checks and totals.
 * AI_MODE=live spends real Claude credit (a few cents a run); mock mode shows the fixtures instead.
 * Never tune a prompt on these cases: they're the test, not the examples.
 *
 *   AI_MODE=live PAYPAL_MODE=mock KIT_DATA_DIR=.data-heldout npx tsx scripts/heldout-run.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnvFiles } from "../src/lib/env-core";

interface Case {
  id: string;
  transcript: string;
  expect: string;
}

async function main() {
  loadEnvFiles();
  const raw = readFileSync("tests/heldout/cases.json");
  const seal = readFileSync("tests/heldout/SEAL.txt", "utf8").split(/\s+/)[0];
  const sha = createHash("sha256").update(raw).digest("hex");
  if (sha !== seal) throw new Error(`tests/heldout/cases.json doesn't match its seal (${sha.slice(0, 12)} vs ${seal.slice(0, 12)}).`);
  console.log(`Seal ok: ${sha}`);

  const { createJob } = await import("../src/lib/say/jobs");
  const { findChecks } = await import("../src/lib/say/checks");
  const { computeTotals, formatCents, formatQuantity, formatRate } = await import("../src/lib/say/money");
  const { priceBook } = await import("../src/lib/say/price-store");
  const { localDay } = await import("../src/lib/say/due");

  const cases = (JSON.parse(raw.toString()) as { cases: Case[] }).cases;
  let spent = 0;
  for (const c of cases) {
    const job = await createJob({ source: "mic", transcript: c.transcript, customer: { name: "Test Customer", email: "test.customer@example.com" }, today: localDay(), visitor: `heldout-${c.id}` });
    spent += job.ai.costUsd + (job.describer?.costUsd ?? 0);
    console.log(`\n=== ${c.id} (extraction: ${job.ai.model ?? "mock"} $${job.ai.costUsd.toFixed(4)}; description: ${job.describer?.model ?? "mock"} $${(job.describer?.costUsd ?? 0).toFixed(4)})`);
    console.log(`Transcript: ${c.transcript}`);
    console.log(`Summary:      ${JSON.stringify(job.details?.summary)}`);
    console.log(`Job site:     ${JSON.stringify(job.details?.site)}`);
    console.log(`Service date: ${JSON.stringify(job.details?.serviceDate)}`);
    for (const line of job.lines) {
      console.log(`- ${line.name}: ${formatQuantity(line.quantityMilli)} x ${formatCents(line.unitCents)}${line.taxed === false ? "" : " (taxed)"}\n    ${JSON.stringify(line.description)}`);
    }
    console.log(`Extracted tax rate: ${formatRate(job.taxRateMilli)}%`);
    const checks = findChecks({ ...job, book: priceBook(job.visitor) });
    for (const check of checks) console.log(`Check [${check.kind}] ${check.text}${check.choices?.length ? ` Buttons: ${check.choices.map((ch) => ch.label).join(" | ")} | Other rate | No tax` : ""}`);
    if (!checks.length) console.log("Checks: none");
    const rates = [job.taxRateMilli, ...(checks.find((ch) => ch.kind === "tax")?.choices?.map((ch) => ch.rateMilli) ?? [])];
    for (const rate of [...new Set(rates)]) {
      const t = computeTotals(job.lines, rate);
      console.log(`At ${formatRate(rate)}%: items ${formatCents(t.subtotalCents)}, tax ${formatCents(t.taxCents)}, total ${formatCents(t.totalCents)}`);
    }
    console.log(`Expected: ${c.expect}`);
  }
  console.log(`\nApp-side Claude spend: $${spent.toFixed(4)}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
