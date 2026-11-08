/**
 * What happens to a recording when the app can't use it yet. Nobody should have to say a job twice.
 * The limit test trips the server's real limiter. The credit tests stand in for the server's reply,
 * because mock mode never spends: the server's side of those is in tests/unit/say-take.test.ts.
 */
import { expect, test, type Page } from "@playwright/test";
import { kitStatus, readJob, jobId, settleChecks, auditedActions, expectPlainWords } from "./flow";
import { recordTake, uploads, useToneMic } from "./take-helpers";

// Its own address, so this file's limit doesn't touch anything else in the run.
const ADDRESS = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
test.use({ extraHTTPHeaders: { "x-forwarded-for": ADDRESS } });

test.beforeEach(async ({ page, request }) => {
  test.skip((await kitStatus(request)).live, "Mock only: the live check spends on the one mic clip");
  await useToneMic(page);
  await page.goto("/jobs");
  await page.getByTestId("contact-tom-baker").click();
});

/** The take is on the screen, for the right customer, and the record button hasn't replaced it. */
async function expectKept(page: Page, title: string) {
  await expect(page.getByTestId("take-problem")).toContainText(title);
  await expect(page.getByTestId("take-customer")).toHaveText("Tom Baker");
  await expect(page.getByTestId("record-start")).toHaveCount(0);
}

const refuse = (page: Page, path: string, status: number, type: string, message: string) =>
  page.route(path, (route) => (route.request().method() === "POST" ? route.fulfill({ status, json: { error: { type, message } } }) : route.fallback()));

test("the rate limit keeps the take, and a retry sends the same recording", async ({ page }, info) => {
  // The real limiter: fill this address's minute with requests that spend nothing.
  await expect.poll(async () => (await page.request.post("/api/speech", { headers: { "content-type": "text/plain" }, data: "x" })).status(), { intervals: [0], timeout: 30_000 }).toBe(429);

  await recordTake(page);
  await expectKept(page, "Too many tries in a minute");
  await expect(page.getByTestId("take-detail")).toContainText("Your recording is safe");
  await expect(page.getByTestId("retry-take")).toBeDisabled();
  await expect(page.getByTestId("retry-take")).toContainText(/Try again in \d+s/);
  await page.screenshot({ path: `screenshots/take-limit-${info.project.name}.png`, fullPage: true });

  await expect(page.getByTestId("retry-take")).toBeEnabled({ timeout: 75_000 });
  await page.getByTestId("retry-take").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
  await expect(page.getByTestId("customer-name")).toHaveValue("Tom Baker");

  const [first, second] = await uploads(page);
  expect(first.size).toBeGreaterThan(0);
  expect(second).toEqual(first);

  await page.goto("/jobs");
  await expect(page.getByTestId("record-start")).toBeVisible();
  await expect(page.getByTestId("kept-take")).toHaveCount(0);
});

test("speech out of credit keeps the take, and it's still there after a reload", async ({ page }, info) => {
  await refuse(page, "**/api/speech", 402, "speech_credit", "Speech to text has run out of credit.");
  await recordTake(page);
  await expectKept(page, "Speech to text is out of credit");
  await expect(page.getByTestId("take-detail")).toContainText("Your recording is safe");
  await page.screenshot({ path: `screenshots/take-speech-credit-${info.project.name}.png`, fullPage: true });

  await page.reload();
  await expectKept(page, "wasn't read yet");

  await page.unroute("**/api/speech");
  await page.getByTestId("retry-take").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
});

test("AI out of credit keeps what was heard, and a retry doesn't pay to hear it twice", async ({ page }, info) => {
  await refuse(page, "**/api/jobs", 402, "ai_credit", "Today's AI budget is used up. It resets at midnight UTC.");
  await recordTake(page);
  await expectKept(page, "The AI is out of credit");
  await expect(page.getByTestId("take-detail")).toContainText("resets at midnight UTC");
  await expect(page.getByTestId("take-heard")).toContainText("heating element");
  await page.screenshot({ path: `screenshots/take-ai-credit-${info.project.name}.png`, fullPage: true });

  await page.unroute("**/api/jobs");
  await page.getByTestId("retry-take").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
  await expect(page.getByTestId("customer-name")).toHaveValue("Tom Baker");
  expect(await uploads(page)).toHaveLength(1);
});

test("no signal keeps the take", async ({ page }) => {
  await page.route("**/api/speech", (route) => route.abort());
  await recordTake(page);
  await expectKept(page, "Couldn't reach the server");
  await page.unroute("**/api/speech");
  await page.getByTestId("retry-take").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
});

test("a take with nothing in it asks for a new one", async ({ page }) => {
  await refuse(page, "**/api/speech", 422, "empty_transcript", "Nothing was heard in that recording. Try again.");
  await recordTake(page);
  await expect(page.getByTestId("take-problem")).toHaveText("Nothing was heard");
  await expect(page.getByTestId("retry-take")).toHaveCount(0);
  await page.getByTestId("discard-take").click();
  await expect(page.getByTestId("record-start")).toBeEnabled();
});

// Next hides this page instead of closing it, so these two come back the way a person does.
test("a take that became a job leaves a clean page for the next one", async ({ page }) => {
  await recordTake(page);
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
  await page.goBack();
  await expect(page.getByTestId("record-start")).toBeDisabled();
  await expect(page.getByTestId("contact-tom-baker")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("try-sample")).toBeEnabled();
  await expect(page.getByTestId("kept-take")).toHaveCount(0);
  await expect(page.getByTestId("job-row")).toHaveCount(1);
});

test("a kept take is still there after a look at the sample job", async ({ page }) => {
  await refuse(page, "**/api/speech", 402, "speech_credit", "Speech to text has run out of credit.");
  await recordTake(page);
  await expectKept(page, "Speech to text is out of credit");

  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
  await page.goBack();
  await expectKept(page, "Speech to text is out of credit");

  await page.unroute("**/api/speech");
  await page.getByTestId("retry-take").click();
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
  await expect(page.getByTestId("customer-name")).toHaveValue("Tom Baker");
});

test("someone's real email is refused by the Guard, with what to do about it", async ({ page, request }, info) => {
  await page.getByTestId("contact-other").click();
  await page.locator("#typed-name").fill("Jo Judge");
  await page.locator("#typed-email").fill("jo.judge@realmail.test");
  await expect(page.getByTestId("typed-email-note")).toContainText("ending in @example.com");
  await recordTake(page);
  await page.waitForURL(/\/jobs\/job_/, { timeout: 30_000 });
  await expect(page.getByTestId("customer-email-note")).toContainText("ending in @example.com");

  await settleChecks(page);
  await page.getByTestId("send-invoice").click();
  const refused = page.getByTestId("job-error");
  await expect(refused).toContainText("Nothing was sent", { timeout: 30_000 });
  await expect(refused).toContainText("name@example.com");
  await expect(refused).toBeInViewport();
  await page.screenshot({ path: `screenshots/guard-refused-${info.project.name}.png`, fullPage: true });
  const id = jobId(page);
  expect((await readJob(request, id)).invoice).toBeUndefined();
  await expect(page.getByTestId("approval-prompt")).toHaveCount(0);

  // The Guard did this, it's on the record, and the public log doesn't show the address.
  expect(await auditedActions(request, "send_job_invoice")).toContain("tool.denied");
  // In plain words on the job; the rule's own wording (the payee allowlist) is behind Details.
  await expect(page.getByTestId("plain-step").filter({ hasText: "only sends to made-up @example.com addresses" })).toHaveCount(1);
  await expectPlainWords(page, /allowlist/i);
  await page.goto("/activity");
  await expect(page.getByTestId("activity-row").filter({ hasText: "Invoice: stopped before anything was sent." }).first()).toBeVisible();
  await expectPlainWords(page, /Hash-chained/);
  await page.goto(`/jobs/${id}`);
  expect(await (await request.get("/api/audit")).text()).not.toContain("realmail.test");

  await page.getByTestId("customer-email").fill("jo.judge@example.com");
  await expect(page.getByTestId("customer-email-note")).toHaveCount(0);
  await page.getByTestId("send-invoice").click();
  await expect(page.getByTestId("approval-prompt")).toContainText("jo.judge@example.com", { timeout: 30_000 });
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });
});
