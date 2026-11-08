/**
 * Live AI often writes a description with words that weren't said, and the confirm screen puts a
 * note with "Description looks right" on that line. Pressing it must clear that note, and only that
 * one. The mock fixture (src/lib/say/sample-wordy.ts) writes like the live AI, on both lines.
 */
import { expect, test } from "@playwright/test";
import { keepToOneCall, kitStatus } from "./flow";
import { WORDY_TRANSCRIPT } from "../../src/lib/say/sample-wordy";

test("Description looks right clears that line's note, one press per line, and it stays cleared", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(live, "The fixture is the mock AI's: live AI writes its own words");
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  const today = new Date().toLocaleDateString("en-CA");
  const made = await request.post("/api/jobs", { data: { source: "mic", today, customer: { name: "Derek Evans", email: "derek.evans@example.com" }, transcript: WORDY_TRANSCRIPT, speech: { mocked: true, model: "Speech mock" } } });
  expect(made.ok()).toBe(true);
  await page.goto(`/jobs/${(await made.json()).id}`);

  const keep = page.getByTestId("keep-description");
  const notes = page.getByTestId("line-words");
  await expect(keep).toHaveCount(2);
  await expect(notes.first()).toContainText("in what you said");

  const labor = page.getByTestId("invoice-line").first();
  await labor.getByTestId("keep-description").click();
  await expect(labor.getByTestId("line-words")).toHaveCount(0);
  await expect(keep).toHaveCount(1);
  // A re-render (any edit) doesn't bring it back.
  await page.getByTestId("invoice-line").nth(1).getByTestId("line-price").fill("50.00");
  await expect(labor.getByTestId("line-words")).toHaveCount(0);

  await page.getByTestId("invoice-line").nth(1).getByTestId("keep-description").click();
  await expect(keep).toHaveCount(0);
  await expect(notes).toHaveCount(0);
});
