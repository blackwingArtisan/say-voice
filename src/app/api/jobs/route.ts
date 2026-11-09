import { z } from "zod";
import { HttpError, readJson, route } from "@/lib/http";
import { contactById } from "@/lib/say/contacts";
import { exampleJob, kickExampleJob } from "@/lib/say/example-job";
import { kickTradeHistory } from "@/lib/say/paypal-history";
import { createJob, listJobs, viewJob } from "@/lib/say/jobs";
import { saidAtFrom } from "@/lib/say/said-to-sent";
import { SAMPLE_CONTACT_ID, SAMPLE_TRANSCRIPT } from "@/lib/say/sample";
import { isPaid } from "@/lib/say/types";
import { visitorOf } from "@/lib/say/visitor";

const Customer = z.object({ name: z.string().trim().min(1).max(140), email: z.string().trim().email() });

const Today = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The browser's calendar day");

const Body = z.discriminatedUnion("source", [
  z.object({ source: z.literal("sample"), today: Today }),
  z.object({
    source: z.literal("mic"),
    today: Today,
    customer: Customer,
    transcript: z.string().trim().min(1).max(5000),
    speech: z.object({ mocked: z.boolean(), model: z.string().max(60), durationSec: z.number().optional() }),
    /** The speech route's own stamp of when the recording arrived. */
    heardAt: z.string().datetime().optional(),
  }),
]);

/** This browser's jobs, and the finished sample every visitor sees. */
export const GET = route(async (req) => {
  const example = exampleJob();
  if (!isPaid(example?.invoice)) kickExampleJob(); // still being made, or the store was reset since the server started
  kickTradeHistory();
  return { jobs: listJobs(visitorOf(req)), example: isPaid(example?.invoice) ? viewJob(example!) : null };
});

/** Reads the transcript into a job. Costs one Claude call unless AI is in mock mode. */
export const POST = route(
  async (req) => {
    const receivedAt = new Date();
    const body = await readJson(req, Body);
    const visitor = visitorOf(req);
    if (body.source === "mic") {
      const { heardAt, ...mic } = body;
      return viewJob(await createJob({ ...mic, visitor, saidAt: saidAtFrom(heardAt, receivedAt) }));
    }
    const contact = contactById(SAMPLE_CONTACT_ID);
    if (!contact) throw new HttpError(500, "The sample customer is missing.");
    return viewJob(await createJob({ source: "sample", visitor, saidAt: receivedAt.toISOString(), today: body.today, transcript: SAMPLE_TRANSCRIPT, customer: { name: contact.name, email: contact.email } }));
  },
  { rateLimit: "ai" },
);
