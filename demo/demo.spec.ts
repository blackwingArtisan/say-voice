/**
 * DEMO VIDEO (npm run demo:record). The sample job, start to paid invoice, with captions.
 * Keep it under ~2:50. Amounts come from the one constant in src/lib/say/sample.ts.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { caption, DemoClock, highlight, titleCard } from "./captions";
import { SAMPLE_AMOUNTS } from "../src/lib/say/sample";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** A caption with its element lit up, held for reading time. */
const point = (page: Page, text: string, target: Locator) => Promise.all([caption(page, text), highlight(page, target, 3000)]);

test("demo", async ({ page }) => {
  const clock = new DemoClock(170);

  // Scene 1: the pitch
  await page.goto("/");
  await titleCard(page, "Say-Voice", "Say the job. The invoice is out before you drive off.");
  await caption(page, "Plumbers invoice late because the paperwork waits until night.");
  await caption(page, "Say-Voice turns a few seconds of speech into a real PayPal invoice.");
  clock.check("pitch");

  // Scene 2: speak the job
  await page.goto("/jobs");
  await caption(page, "Names always come from your contacts. Speech can't be trusted with them.");
  await point(page, "In the van you press record and talk. This run uses a job recorded earlier.", page.getByTestId("try-sample"));
  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 90_000 });
  await expect(page.getByTestId("invoice-line")).toHaveCount(2);
  clock.check("heard");

  // Scene 3: the catch
  const element = page.getByTestId("invoice-line").nth(1);
  await point(page, "The speaker said fifty. Speech to text heard fifteen.", page.getByTestId("transcript"));
  await point(page, "Plain code knows this part usually costs fifty, and it stops the invoice.", element.getByTestId("line-usual"));
  await point(page, `The total would have been ${dollars(SAMPLE_AMOUNTS.heardTotalCents)}. One tap fixes it.`, element.getByTestId("use-usual"));
  await element.getByTestId("use-usual").click();
  await expect(page.getByTestId("invoice-total")).toHaveText(dollars(SAMPLE_AMOUNTS.spokenTotalCents));
  await point(page, "Totals are worked out by code, in cents. The AI never states them.", page.getByTestId("invoice-total"));
  clock.check("corrected");

  // Scene 3b: a clear invoice
  await expect(page.getByTestId("job-summary")).not.toHaveValue("");
  await point(page, "A second AI call writes what the customer reads: what the job was, in your words.", page.getByTestId("job-summary"));
  await point(page, "Every line says what it covers. Code flags any word you didn't say.", page.getByTestId("line-description").first());
  clock.check("clear");

  // Scene 4: the gate
  await page.getByTestId("send-invoice").click();
  const prompt = page.getByTestId("approval-prompt");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await point(page, "Nothing goes out until you approve this exact amount.", prompt.getByTestId("approve-button"));
  await prompt.getByTestId("approve-button").click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });
  clock.check("sent");

  // Scene 5: chasing it
  await point(page, "The invoice number, status and note to the customer are read back from PayPal.", page.getByTestId("result-note"));
  await page.getByTestId("ask-reminder").click();
  const reminder = page.getByTestId("approval-prompt");
  await expect(reminder).toBeVisible({ timeout: 30_000 });
  await point(page, "Unpaid? An agent writes the reminder, and it waits for your approval too.", reminder.getByTestId("approve-button"));
  await reminder.getByTestId("approve-button").click();
  await expect(page.getByTestId("reminder-sent")).toBeVisible({ timeout: 30_000 });
  await point(page, "It went out only after that approval.", page.getByTestId("reminder-sent"));
  clock.check("reminded");

  // Scene 6: paid. Mock PayPal plays the customer. On the sandbox the customer really pays, and the hosted suite proves that.
  const job = await (await page.request.get(`/api/jobs/${new URL(page.url()).pathname.split("/").pop()}`)).json();
  const paid = await page.request.post(`/api/dev/pay-invoice/${job.invoice.id}`);
  if (paid.ok()) {
    const banner = page.getByTestId("paid-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await banner.scrollIntoViewIfNeeded();
    await point(page, "The customer pays, and PayPal's webhook turns the job paid by itself.", banner);
    clock.check("paid");
  }

  // Scene 7: it learns
  await page.goto("/prices");
  await point(page, "The price book learned from this invoice. It's plain code, and it only knows what you sent.", page.getByTestId("price-row").filter({ hasText: "Heating element" }));
  clock.check("learned");

  // Scene 8: proof
  await page.goto("/activity");
  await caption(page, "Every decision is on a hash-chained audit log.");
  await titleCard(page, "Say-Voice", "Built with PayPal Invoicing, Claude and ElevenLabs Scribe", 2800);
  clock.check("end");
});
