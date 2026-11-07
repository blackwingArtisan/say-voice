/**
 * Scores the description step on the dev set (tests/dev/description-jobs.json) through the real
 * pipeline: the frozen extraction, then the description step, then the confirm screen's word
 * check. A job passes when every must_mention phrase is on the description of its own line, and
 * no description or summary has an unsaid word the app's word guard failed to flag.
 *
 * The extraction is frozen, so its output is kept in KIT_DATA_DIR and reused while the description
 * step is tuned (--fresh reads it again). AI_MODE=live spends real Claude credit.
 *
 *   AI_MODE=live PAYPAL_MODE=mock KIT_DATA_DIR=.data-dev npx tsx scripts/description-dev.ts [--fresh] [--only dev01,dev02]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFiles } from "../src/lib/env-core";
import { missingFrom, saidIn, unsaid } from "./description-score";

interface Expect {
  line: string;
  amount: number;
  must_mention: string[];
}
interface DevJob {
  id: string;
  transcript: string;
  expect: Expect[];
}

const DEV_SHA =
  "c7b889148c0d17761bae3823b84fdc1718c8e604406f7131a26b212e28ddd35d";

async function main() {
  loadEnvFiles();
  const raw = readFileSync("tests/dev/description-jobs.json");
  const sha = createHash("sha256").update(raw).digest("hex");
  if (sha !== DEV_SHA)
    throw new Error(
      `tests/dev/description-jobs.json changed (${sha.slice(0, 12)}).`,
    );
  const args = process.argv.slice(2);
  const only = args.includes("--only")
    ? args[args.indexOf("--only") + 1].split(",")
    : null;
  const jobs = (JSON.parse(raw.toString()) as DevJob[]).filter(
    (job) => !only || only.includes(job.id),
  );

  const { extractJob, SYSTEM } = await import("../src/lib/say/extract");
  const { describeJob } = await import("../src/lib/say/describe");
  const { findChecks } = await import("../src/lib/say/checks");
  const { formatCents, formatQuantity, lineCents } =
    await import("../src/lib/say/money");
  const { getEnv } = await import("../src/lib/env");
  type Extracted = Awaited<ReturnType<typeof extractJob>>;

  const cacheFile = path.join(getEnv().dataDir, "dev-extractions.json");
  const cache: Record<string, Extracted> =
    !args.includes("--fresh") && existsSync(cacheFile)
      ? JSON.parse(readFileSync(cacheFile, "utf8"))
      : {};
  const keyOf = (t: string) =>
    createHash("sha256").update(`${SYSTEM}\n${t}`).digest("hex").slice(0, 16);
  const today = new Date().toISOString().slice(0, 10);
  let spent = 0;

  // A few at a time: the spend cap reserves each call's worst case before it goes.
  const results: {
    job: DevJob;
    extracted: Extracted;
    described: Awaited<ReturnType<typeof describeJob>>;
  }[] = [];
  const run = async (job: DevJob) => {
    const key = keyOf(job.transcript);
    const extracted = cache[key] ?? (await extractJob(job.transcript));
    if (!cache[key]) spent += extracted.ai.costUsd;
    cache[key] = extracted;
    const described = await describeJob(job.transcript, extracted.lines, today);
    spent += described.ai.costUsd;
    results.push({ job, extracted, described });
  };
  for (let i = 0; i < jobs.length; i += 3)
    await Promise.all(jobs.slice(i, i + 3).map(run));
  results.sort((a, b) => a.job.id.localeCompare(b.job.id));
  mkdirSync(path.dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 1));

  let passed = 0;
  for (const { job, extracted, described } of results) {
    const lines = described.lines;
    const problems: string[] = [];
    const checks = findChecks({
      transcript: job.transcript,
      heardLines: lines,
      lines,
      flags: [],
      taxRateMilli: 0,
      book: [],
      details: described.details,
      aiWording: described.aiWording,
    });
    const flagged = checks
      .filter((check) => check.kind === "words")
      .flatMap((check) =>
        [...check.text.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      );
    const used = new Set<string>();
    for (const want of job.expect) {
      const cents = Math.round(want.amount * 100);
      const byName = (l: (typeof lines)[number]) =>
        l.name.toLowerCase().replace(/s$/, "") ===
        want.line.toLowerCase().replace(/s$/, "");
      const line =
        lines.find(
          (l) => !used.has(l.key) && lineCents(l) === cents && byName(l),
        ) ??
        lines.find((l) => !used.has(l.key) && lineCents(l) === cents) ??
        lines.find((l) => !used.has(l.key) && byName(l));
      if (!line) {
        problems.push(`no line for ${want.line} ${formatCents(cents)}`);
        continue;
      }
      used.add(line.key);
      for (const phrase of want.must_mention) {
        const missing = missingFrom(
          line.description ?? "",
          phrase,
          job.transcript,
        );
        if (missing.length)
          problems.push(
            `${line.name}: "${phrase}" missing ${missing.join(", ")}`,
          );
      }
    }
    const texts = [
      { where: "summary", text: described.details.summary },
      ...lines.map((l) => ({ where: l.name, text: l.description ?? "" })),
    ];
    for (const { where, text } of texts) {
      const loose = unsaid(text, job.transcript).filter(
        (w) => !flagged.some((f) => saidIn(w, f)),
      );
      if (loose.length)
        problems.push(`${where}: unsaid and not flagged: ${loose.join(", ")}`);
    }
    if (!problems.length) passed++;
    console.log(
      `\n${problems.length ? "FAIL" : "PASS"} ${job.id} (extraction ${extracted.ai.model ?? "mock"}, description ${described.ai.model ?? "mock"})`,
    );
    console.log(`  Summary: ${JSON.stringify(described.details.summary)}`);
    for (const l of lines)
      console.log(
        `  - ${l.name}: ${formatQuantity(l.quantityMilli)} x ${formatCents(l.unitCents)}  ${JSON.stringify(l.description ?? "")}`,
      );
    if (flagged.length) console.log(`  Guard flagged: ${flagged.join(", ")}`);
    for (const f of described.flags) console.log(`  Flag: ${f.text}`);
    for (const p of problems) console.log(`  ✗ ${p}`);
  }
  console.log(
    `\nScore: ${passed}/${results.length}. App-side Claude spend this run: $${spent.toFixed(4)}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
