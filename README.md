# Say-Voice

> Tradespeople say the job out loud in the van, check the numbers, and a PayPal invoice goes out before they drive off.

**Live demo:** https://say-voice.onrender.com · **Video (≤3 min):** TODO: add the link once it's recorded · **License:** MIT

The site is on free hosting, so the first visit can take a minute.

![The confirm screen](docs/screenshot.png)

## The problem

A plumber finishes a job at two in the afternoon and writes the invoice at nine at night, from memory. Hours get rounded, parts get forgotten, and money comes in days later than it should. The work is done on site, but the paperwork waits for a desk. Dictating is quick, but speech to text can't be trusted with money: in testing, every tool heard "sixty an hour" as "16 hour", and a model stated a wrong total on 6 of 20 clips.

## What it does

- Pick the customer from your contacts. Names never come from speech.
- Press record and say the job: hours, parts, prices, tax.
- ElevenLabs Scribe v2 writes it down and Claude pulls out the line items.
- Check the invoice. Your words sit beside every number, and everything is editable.
- The app holds the send until each worry is settled: a price far from what that item usually costs (fifty heard as fifteen shows "Usually $50.00"), a doubt the AI flagged, or a spoken amount with no line item. Each takes one tap.
- Press send, then approve the exact amount. Nothing reaches the customer before that.
- PayPal creates and sends the invoice. The result screen shows the real number and status, read back from PayPal.
- If it's unpaid, an agent drafts a reminder from what PayPal says is owed. You read the words and approve them before PayPal sends it.
- When the customer pays, the job turns paid by itself, from PayPal's webhook.

The **Prices** page is the price book: seeded with demo items, then learned from the invoices that browser sent.

If the app can't read a recording yet, you keep it. A refused upload, a lost signal or an empty AI or speech balance leaves the take in your browser with a clear message and **Try again**, even after a reload. Speech that was already heard isn't paid for twice. A recording with no words in it asks for a new one.

No mic? **Try a sample job** runs a real recorded job through the same screens, including a mishearing to catch.

## How PayPal is used

All PayPal calls go to the **sandbox** (`https://api-m.sandbox.paypal.com`); there is no live mode in the code. Every call shows on the in-app timeline with its HTTP status and PayPal `debug_id`.

| PayPal API | Endpoint(s) | Where and why |
|---|---|---|
| Invoicing v2 | `POST /v2/invoicing/invoices`, `POST /v2/invoicing/invoices/{id}/send` | Creates the invoice from the checked job and sends it, after approval |
| Invoicing v2 | `GET /v2/invoicing/invoices/{id}` | Reads the invoice back, so the screen shows PayPal's number, status, amount due and payment |
| Invoicing v2 | `POST /v2/invoicing/invoices/{id}/remind` | Sends the reminder the person approved |
| Webhooks | `POST /v1/notifications/verify-webhook-signature` | Verifies PayPal's events. `INVOICING.INVOICE.PAID`, `REFUNDED` and `CANCELLED` update the job when `PAYPAL_WEBHOOK_ID` is set. The event only says something changed, so the status comes from a fresh read |

**Safety around money:** the send and the reminder go through a guard. It enforces a per-action cap, a daily cap, a payee allowlist and idempotency, and it waits for a person every time, whatever the amount. The allowlist means invoices can only go to made-up `@example.com` addresses: type a real one and the guard refuses, and the page says what to do instead. Before sending, the app compares PayPal's own total with the approved total, and stops if they differ by a cent. The server works out the open checks again, so skipping the screen gets a refusal. Every decision goes to a hash-chained, append-only audit log.

## How AI is used

| Where | Model | What it does |
|---|---|---|
| Speech to text | ElevenLabs Scribe v2 | Turns the recording into a transcript. The audio goes from the server to ElevenLabs and isn't stored here |
| Job extraction | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Reads the transcript into line items, quantities, prices and tax, and lists what it's unsure of |
| Reminder agent | Claude Haiku 5.5 (`claude-haiku-5-5`) | Reads the unpaid invoice from PayPal and writes the note the customer would get |

- **Code does the arithmetic**: money is integer cents, and line totals and the invoice total are computed in code, never stated by the AI. The rounding matches PayPal's, checked against real sandbox invoices.
- **The extraction prompt is frozen**: it was tested on sealed clips the prompt had never seen, and a unit test pins its hash.
- **Code checks the AI**: a separate parser finds the amounts in the transcript and warns when one has no line item, and the price book compares each price with what that item usually costs. When the AI doubts a price the book also knows, the book's line replaces the AI's words, so the warning reads the same on every run. Flat-rate labor (one Labor line with no hours said around it) isn't compared with the hourly rate.
- **The agent can't talk its way past a limit**: code refuses a reminder for a paid invoice, a note with any figure other than what's owed, a note with a link, and a third reminder in a day. The check runs before the approval card and again after it, in case the customer paid in between. One proposal a run, so a no ends it.
- **Due dates** come from code: the extraction doesn't return one, so "net 30" or "due in two weeks" is read from the transcript, and the default is 14 days.
- **Cost control**: a hard daily spend cap (worst case reserved before every call) and per-IP rate limits. With the budget used up, a recording waits in the browser, and the sample job runs on a saved Claude reading and says so.
- **Mock mode**: without keys the app runs on clearly labelled fixtures for both speech and AI, so the whole flow works anywhere.

**Built with AI.** This project was built with **Claude Code** (Anthropic's coding agent), which wrote the code under human direction. It started from a shared starter kit that Claude Code also wrote. The product idea, scope and review were human decisions.

## Architecture

```
Browser (Next.js 16 / React 19, Tailwind)
  │  MediaRecorder: microphone audio, uploaded when you stop
  │  SSE /api/events (live timeline)
  ▼
Next.js route handlers (Node)
  ├─ lib/say      speech, extraction, money, price book, checks, send, reminders, paid status
  ├─ agents       the reminder agent and its tools
  ├─ lib/agent    Guard: caps, allowlist, approvals, idempotency, audit
  ├─ lib/paypal   typed PayPal client: sandbox REST or in-memory mock
  ├─ lib/ai       Claude structured output and agent loop; daily spend cap
  ├─ webhooks     verify → ledger → timeline → job paid
  └─ .data/       local JSON: jobs, ledger, audit log, AI spend
```

## Run locally

Requirements: Node 24+ (developed on Node 26), npm.

```bash
npm ci
cp .env.example .env.local                  # optional: values here override ../../.env.shared
AI_MODE=mock PAYPAL_MODE=mock npm run dev   # no credentials needed
```

Open http://localhost:3000. For the real sandbox set `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. For real AI set `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY`. The microphone needs `localhost` or HTTPS.

Checks: `npm run check` (lint, typecheck, unit tests, build), `npm run test:e2e` (mock PayPal), `npm run test:e2e:sandbox` (sends real sandbox invoices). Set `E2E_BASE_URL` to run the sandbox flow against a deployed copy. `ENGINE=webkit npm run test:e2e:engines` runs the mock suite on another browser; `ENGINE` can also be `firefox`, `iphone` or `android`. Each of those uses a stand-in microphone, because only Chromium has a fake one.

The microphone test plays a computer-voice clip through Chromium's fake mic. macOS speech voices can't be redistributed, so the clip isn't in this repo: point `E2E_MIC_CLIP` at any spoken WAV, or the test skips and says why.

## Sandbox test accounts

Invoices go to fictional `example.com` contacts, so no buyer login is needed to send one. To open what the customer sees, use the link on the result screen. To pay one, press **Debit or Credit Card** there and pay as a guest with PayPal's test card `4111 1111 1111 1111`, any future date, any CVV. On a deployed copy the job turns paid within a few minutes. PayPal can't reach `localhost`, so a local copy finds out when you ask for a reminder. To set up your own:

1. In the PayPal Developer Dashboard → **Testing Tools → Sandbox Accounts**, use the default Business (seller) account.
2. Create a sandbox REST app under **Apps & Credentials → Sandbox** and copy its client ID and secret.
3. Optional: add a webhook for `https://<your-deploy>/api/paypal/webhooks` and set `PAYPAL_WEBHOOK_ID`.

## Deploy

Render Blueprint (`render.yaml`): New → Blueprint → this repo, then enter the secrets in the dashboard, including `ELEVENLABS_API_KEY`. Render provides the HTTPS the microphone needs.

## Limitations

- Sandbox only; no live payments are possible.
- US dollars, English speech, and one tax rate per invoice.
- Sales tax is worked out per line, as PayPal does, so it can differ by a cent from tax on the whole sum.
- Recording is capped at two minutes, and the audio is uploaded when you stop, not streamed.
- Speech can still mishear a price. The confirm screen is what catches that, so a person has to read it.
- The price book needs two invoices for an item before it speaks up, and it checks prices, not quantities. A misheard quantity only gets caught by an AI flag or by reading it, and the confirm screen says so.
- There's no login. Jobs and learned prices belong to the browser that made them, so another device starts from the demo prices. Clearing site data does the same.
- A recording that couldn't be read stays in that browser only, one at a time. In a private window it lasts until the page closes.
- Local JSON storage: data resets on redeploy (fine for a demo, not for production).

## License

MIT, see [LICENSE](LICENSE).
