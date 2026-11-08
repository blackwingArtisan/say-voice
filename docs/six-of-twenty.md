# "6 of 20": how the wrong totals were counted

The claim: in testing, an AI model stated a wrong total on 6 of 20 spoken jobs. That is why, in Say-Voice, code does every sum and the AI never states one.

## Method

- **Jobs:** 10 made-up jobs, written with their correct line items and totals before any run. They cover five trades: plumber, electrician, HVAC, painter and handyman.
- **Clips:** each job was spoken by a text-to-speech voice and recorded twice: once clean, and once with background noise mixed in at 10 dB signal-to-noise. That makes 20 clips.
- **Speech to text:** Chrome's built-in speech recognition (Chrome 156, headless, through a live microphone track) wrote each clip down.
- **Extraction:** Claude Sonnet (`claude-sonnet-5-5`) read each transcript and returned the line items and a total.
- **Scoring:** a script compared the model's total with the job's correct total, to the cent. It also added up the model's own line items in code.

## Result

| | Wrong totals |
|---|---|
| Total stated by the model | **6 of 20** (3 clean, 3 noisy) |
| Same line items, total worked out by code | 0 of 20 |

In all 6 the model's total disagreed with its own line items: the items were right and the sum was wrong. One example: the model stated $65.00 where its own lines added up to $215.00, on both the clean and the noisy clip.

Run on 2026-11-01. The spike's scripts and clips live outside this repository.

## What it does and doesn't show

- It shows a model can get the arithmetic wrong even when it read every line right. It doesn't measure how often speech to text mishears a price: that is a separate problem, which the price book handles.
- 20 clips is a small sample, and the voices were synthetic. Read it as "this happens", not as a rate.
