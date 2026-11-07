/**
 * The description step: a second AI call, after extraction, that writes what the customer reads.
 * It gets the transcript and the extracted lines (ids and names) and returns a job summary, the job
 * site, the service date if one was said, and a short description per line id. It can't add,
 * remove or change items, quantities or prices: code merges only text onto line ids that already
 * exist, and the guards in wording.ts check every word before it's kept.
 */
import { z } from "zod";
import { generateObject } from "@/lib/ai";
import { modelLabel } from "@/lib/ai/config";
import { formatCents, formatQuantity } from "./money";
import { PLUS_TAX_DESCRIPTION, PLUS_TAX_TRANSCRIPT, SAMPLE_DESCRIPTION, SAMPLE_TRANSCRIPT } from "./sample";
import { heardFor } from "./spoken";
import type { AiWording, JobDetails, JobFlag, JobLine } from "./types";
import { checkedServiceDate, cleanText, hasLink, lineNumbers, MAX_DESCRIPTION, MAX_SITE, MAX_SUMMARY, saidNumbers, strayNumbers, truncate } from "./wording";

export const DescriptionSchema = z.object({
  job_summary: z.string().describe("One short line: what the job was. Under 100 characters."),
  job_site: z.string().describe("The job's street address if one was said, written cleanly. Empty if none was said."),
  service_date: z.string().describe("YYYY-MM-DD when the speaker said when the work was done. Empty otherwise."),
  service_date_words: z.string().describe("The exact words from the note that say when, such as 'yesterday'. Empty otherwise."),
  lines: z.array(z.object({ id: z.string(), description: z.string().describe("What this charge covers, under 150 characters.") })),
});

export type Description = z.infer<typeof DescriptionSchema>;

export const DESCRIBE_SYSTEM = `You write the words a customer reads on a tradesperson's invoice, so they know exactly what was done, where and when.

You get the raw speech-to-text of the tradesperson's job note, today's date, and the line items already taken from it (id, name, quantity, price). The items are final. Write:
- job_summary: one short line saying what the job was: what was fixed, installed or replaced, and on what.
- job_site: the street address of the job if one was said, tidied (speech-to-text splits things like "66 th"). Empty if none was said.
- service_date and service_date_words: only if the speaker said when the work was done. service_date is YYYY-MM-DD, worked out from today's date; service_date_words are the exact words from the note. Both empty otherwise. Never assume today.
- lines: for every id you were given, a short description of what that charge covers: the work done for labor, the parts and materials for a parts or materials line.

Rules:
- Use only what was said. Never add work, parts, materials, brands, sizes, dates, places or prices that weren't said.
- Use the speaker's own words for parts and work. You may fix an obvious speech-to-text slip, but don't swap in a different word for the same thing.
- Put each detail on the line it belongs to: the steps of the work on the labor line, the things that were bought or fitted on the parts or materials line.
- Leave out filler words (um, uh), false starts, self-corrections, the customer's name, tax and payment terms.
- Don't put prices or totals in a description; the invoice shows them. A time or count the speaker said is fine.
- No links, email addresses or phone numbers.
- Return every id exactly once. You can't add, remove or change items.`;

export function describePrompt(transcript: string, lines: JobLine[], today: string): string {
  const items = lines.map((line) => `- id ${line.key}: ${line.name}, quantity ${formatQuantity(line.quantityMilli)}, ${formatCents(line.unitCents)} each`).join("\n");
  return `Today is ${today}.\n\nDictated job note:\n"""\n${transcript}\n"""\n\nLine items:\n${items}`;
}

/** Mock fixtures: the sample and the tax job have their own, anything else gets the words heard by each price. */
export function mockDescription(transcript: string, lines: JobLine[], today: string): Description {
  const fixture = transcript.trim() === SAMPLE_TRANSCRIPT ? SAMPLE_DESCRIPTION : transcript.trim() === PLUS_TAX_TRANSCRIPT ? PLUS_TAX_DESCRIPTION : null;
  if (fixture) {
    return {
      job_summary: fixture.job_summary,
      job_site: fixture.job_site,
      service_date: fixture.service_date ? `${today.slice(0, 4)}-${fixture.service_date}` : "",
      service_date_words: fixture.service_date_words,
      lines: lines.map((line) => ({ id: line.key, description: fixture.lines[line.name] ?? "" })),
    };
  }
  const firstSentence = transcript.split(/(?<=[.?!])\s/)[0] ?? "";
  return {
    job_summary: truncate(firstSentence, 90),
    job_site: "",
    service_date: "",
    service_date_words: "",
    lines: lines.map((line) => ({ id: line.key, description: heardFor(transcript, line) ?? "" })),
  };
}

export interface Described {
  lines: JobLine[];
  details: JobDetails;
  aiWording: AiWording;
  flags: JobFlag[];
}

/** Why a piece of text was refused, or null when it can stay. */
function refusal(text: string, said: Set<number>, allowed: number[] = []): string | null {
  if (hasLink(text)) return "a link";
  const stray = strayNumbers(text, said, allowed);
  return stray.length ? `"${stray[0]}", which you didn't say` : null;
}

/**
 * Merges the AI's words onto the lines. Only text moves: ids the AI made up are ignored, and a
 * line it skipped stays without a description. Anything refused is blanked and said so.
 */
export function applyDescription(out: Description, lines: JobLine[], transcript: string, today: string): Described {
  const said = saidNumbers(transcript);
  const flags: JobFlag[] = [];
  const wording: AiWording = { summary: "", site: "", lines: {} };

  const described = lines.map((line) => {
    const raw = out.lines.find((l) => l.id === line.key)?.description ?? "";
    const text = truncate(cleanText(raw), MAX_DESCRIPTION);
    const refused = text ? refusal(text, said, lineNumbers(line)) : null;
    if (refused) {
      flags.push({ text: `The AI's description of ${line.name} had ${refused}, so it was left out. Write one in your own words.`, lineKey: line.key });
      return { ...line, description: "" };
    }
    wording.lines[line.key] = text;
    return { ...line, description: text };
  });

  const field = (raw: string, max: number, label: string) => {
    const text = truncate(cleanText(raw), max);
    const refused = text ? refusal(text, said) : null;
    if (!refused) return text;
    flags.push({ text: `The AI's ${label} had ${refused}, so it was left out.` });
    return "";
  };
  wording.summary = field(out.job_summary, MAX_SUMMARY, "job summary");
  wording.site = field(out.job_site, MAX_SITE, "job site");
  const serviceDate = checkedServiceDate(out.service_date, out.service_date_words, transcript, today);

  return { lines: described, details: { summary: wording.summary, site: wording.site, serviceDate }, aiWording: wording, flags };
}

export interface DescribedJob extends Described {
  ai: { mocked: boolean; model?: string; costUsd: number };
}

export async function describeJob(transcript: string, lines: JobLine[], today: string): Promise<DescribedJob> {
  const res = await generateObject({
    schema: DescriptionSchema,
    system: DESCRIBE_SYSTEM,
    prompt: describePrompt(transcript, lines, today),
    model: "default",
    maxTokens: 4000,
    effort: "medium",
    feature: "job description",
    mock: () => mockDescription(transcript, lines, today),
  });
  return { ...applyDescription(res.data, lines, transcript, today), ai: { mocked: res.mocked, model: res.model ? modelLabel(res.model) : undefined, costUsd: res.costUsd } };
}

/** The sample's stored words, so the demo still reads clearly when the AI budget is used up. */
export const savedSampleWording = (transcript: string, lines: JobLine[], today: string): DescribedJob => ({
  ...applyDescription(mockDescription(transcript, lines, today), lines, transcript, today),
  ai: { mocked: true, costUsd: 0 },
});

/** When the call fails the job still opens: the person writes the words, and the vague-line check asks for them. */
export function undescribed(lines: JobLine[], why: string): DescribedJob {
  return {
    lines,
    details: { summary: "", site: "", serviceDate: "" },
    aiWording: { summary: "", site: "", lines: {} },
    flags: [{ text: `${why} Add a job summary and a description on each line yourself.` }],
    ai: { mocked: false, costUsd: 0 },
  };
}
