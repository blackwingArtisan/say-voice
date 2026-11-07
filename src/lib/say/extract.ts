/**
 * The extraction step. InvoiceSchema, SYSTEM, the user prompt wording, model and maxTokens are
 * FROZEN from spikes/invoice/stt/beefed/extract.ts and tested on sealed sets (TK-43). Changing
 * any of them voids those results, so a unit test pins the prompt's sha256 (e22c8bb0...).
 * `customer` and `total` stay in the schema because the prompt was tested with them, but neither
 * reaches an invoice: names come from the picker, totals from code. The heard name is only shown.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateObject } from "@/lib/ai";
import { modelLabel } from "@/lib/ai/config";
import { flagsToShow } from "./flags";
import { dollarsToCents, percentToRateMilli, unitsToMilli } from "./money";
import { PLUS_TAX_EXTRACTION, PLUS_TAX_TRANSCRIPT, SAMPLE_EXTRACTION } from "./sample";
import type { JobFlag, JobLine } from "./types";

export const InvoiceSchema = z.object({
  customer: z.string().describe("The customer's full name, first and last, exactly as heard."),
  service_address: z.string().nullable().describe("Job site street address if one was spoken, else null."),
  line_items: z.array(
    z.object({
      name: z.string().describe("Short name of the part, material or service."),
      quantity: z.number().describe("Units, or hours for labor. 1 for a flat charge."),
      unit_price: z.number().describe("Price per unit in dollars. Flat charge: the whole amount."),
    }),
  ),
  tax_rate: z.number().nullable().describe("Sales tax as a percent, 5 for five percent. Null if none was mentioned or it was declined."),
  total: z.number().describe("Grand total in dollars including any tax, rounded to cents."),
  uncertain: z.array(z.string()).describe("Each word, name, quantity or price you corrected or are not sure of, in plain words. Empty if none."),
});

export const SYSTEM = `You turn a tradesperson's dictated job note into invoice fields.

The input is raw speech-to-text. It may have no punctuation, odd capitalization, and numbers as digits or words. It was spoken in a work van, so it is informal.

Rules:
- Use only what was said. Never invent a charge, a name or a price.
- If the speaker corrects themselves ("sorry", "I mean", "scratch that"), use the corrected value.
- Read prices as a tradesperson says them: "three ten" is $310, "seven forty" is $740. A shorthand like "six seventy five" can be $6.75 or $675; pick what fits that item, so a small part is $6.75.
- Hourly work is one line item named "Labor", with quantity in hours and unit_price the hourly rate. Flat-rate labor is quantity 1 with the whole amount as unit_price.
- A part with no stated count is quantity 1. A price given for several units "each" is the unit_price, not the line amount.
- A count that only describes the work, with no charge attached, is not a line item. Numbers in an address or a product spec are not prices or quantities.
- total is the sum of quantity times unit_price, plus tax on that whole sum if a rate was given, rounded to cents.

The speech-to-text is general dictation software that doesn't know trade vocabulary, so it makes sound-alike mistakes. Before extracting, work out what was most likely said, given the trade and the job.
- A word or phrase that makes no sense here is probably a misheard part, name or number. Short number words are easily misheard as similar-sounding words.
- A plural, or a price "each", with no count may mean a count was misheard.
- Every spoken amount must end up in a line item, the tax or the stated total. Never leave one out.
- A customer name that doesn't sound like a person's name was probably misheard.
- List everything you corrected or aren't sure of in uncertain, so a person can check it before sending. Fixing a mistake and flagging it are both required.`;

export type Extraction = z.infer<typeof InvoiceSchema>;

export interface ExtractedJob {
  lines: JobLine[];
  taxRateMilli: number;
  flags: JobFlag[];
  heardName: string;
  ai: { mocked: boolean; model?: string; costUsd: number; saved?: boolean };
}

/** Turns the model's numbers into whole cents and ties each doubt to its row. */
export function toJobFields(extraction: Extraction): Pick<ExtractedJob, "lines" | "taxRateMilli" | "flags" | "heardName"> {
  const lines: JobLine[] = extraction.line_items.map((item) => ({
    key: randomUUID().slice(0, 8),
    name: item.name.trim(),
    quantityMilli: unitsToMilli(item.quantity),
    unitCents: dollarsToCents(item.unit_price),
  }));
  const flags = flagsToShow(extraction.uncertain, lines).map(({ text, line }) => ({ text, lineKey: line === null ? undefined : lines[line].key }));
  return { lines, taxRateMilli: percentToRateMilli(extraction.tax_rate), flags, heardName: extraction.customer.trim() };
}

/** The sample's stored reading, so the demo still runs when the AI budget is used up. */
export const savedSampleReading = (): ExtractedJob => ({ ...toJobFields(SAMPLE_EXTRACTION), ai: { mocked: true, costUsd: 0, saved: true } });

export async function extractJob(transcript: string): Promise<ExtractedJob> {
  const res = await generateObject({
    schema: InvoiceSchema,
    system: SYSTEM,
    prompt: `Dictated job note:\n"""\n${transcript}\n"""`,
    model: "smart",
    maxTokens: 3000,
    feature: "job extraction",
    // The tax job has its own fixture. Every other transcript reads as the sample, on purpose.
    mock: () => (transcript.trim() === PLUS_TAX_TRANSCRIPT ? PLUS_TAX_EXTRACTION : SAMPLE_EXTRACTION),
  });
  return { ...toJobFields(res.data), ai: { mocked: res.mocked, model: res.model ? modelLabel(res.model) : undefined, costUsd: res.costUsd } };
}
