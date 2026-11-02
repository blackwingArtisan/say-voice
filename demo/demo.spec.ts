/**
 * DEMO VIDEO (npm run demo:record). The sample job, start to sent invoice, with captions.
 * Keep it under ~2:50. Amounts come from the one constant in src/lib/say/sample.ts.
 */
import { expect, test } from "@playwright/test";
import { caption, DemoClock, highlight, titleCard } from "./captions";
import { SAMPLE_AMOUNTS } from "../src/lib/say/sample";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
  await caption(page, "Names always come from your contacts. Speech can't be trusted with them.", { wait: false });
  await highlight(page, page.getByTestId("try-sample"));
  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 90_000 });
  await expect(page.getByTestId("invoice-line")).toHaveCount(2);
  clock.check("heard");

  // Scene 3: the catch
  const element = page.getByTestId("invoice-line").nth(1);
  await caption(page, "The speaker said fifty. Speech to text heard fifteen.", { wait: false });
  await highlight(page, page.getByTestId("transcript"));
  await caption(page, "Your words sit beside every number, and the doubt is flagged on the item it's about.", { wait: false });
  await highlight(page, element.getByTestId("line-flag"));
  await caption(page, `The total would have been ${dollars(SAMPLE_AMOUNTS.heardTotalCents)}. One edit fixes it.`, { wait: false });
  await element.getByTestId("line-price").fill((SAMPLE_AMOUNTS.spokenElementCents / 100).toFixed(2));
  await expect(page.getByTestId("invoice-total")).toHaveText(dollars(SAMPLE_AMOUNTS.spokenTotalCents));
  await highlight(page, page.getByTestId("invoice-total"));
  await caption(page, "Totals are worked out by code, in cents. The AI never states them.");
  clock.check("corrected");

  // Scene 4: the gate
  await page.getByTestId("send-invoice").click();
  const prompt = page.getByTestId("approval-prompt");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await caption(page, "Nothing goes out until you approve this exact amount.", { wait: false });
  await highlight(page, prompt.getByTestId("approve-button"));
  await prompt.getByTestId("approve-button").click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });
  clock.check("sent");

  // Scene 5: proof
  await caption(page, "The invoice number and status are read back from PayPal.");
  await page.goto("/activity");
  await caption(page, "Every decision is on a hash-chained audit log.");
  await titleCard(page, "Say-Voice", "Built with PayPal Invoicing, Claude and ElevenLabs Scribe", 2800);
  clock.check("end");
});
