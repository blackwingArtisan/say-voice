/**
 * The "Try a sample job": a real ElevenLabs Scribe v2 transcript of a computer voice with road
 * noise, and the real Sonnet extraction of it (TK-43 fresh-2, job09, noisy, frozen prompt). The
 * speaker said "fifty", speech heard "fifteen", and the extraction flagged it. That is the exact
 * trap the confirm screen exists to catch. The clip itself stays out of this repo: macOS system
 * voices can't be redistributed. Every demo amount lives here.
 */

export const SAMPLE_CONTACT_ID = "daniel-evans";

export const SAMPLE_TRANSCRIPT =
  "Daniel Evans, the dryer would not heat. I was there three quarters of an hour at eighty an hour. New heating element, fifteen. No wait, make that fifteen dollars. No tax on this one. It runs hot again and the vent is clear.";

export const SAMPLE_EXTRACTION = {
  customer: "Daniel Evans",
  service_address: null,
  line_items: [
    { name: "Labor", quantity: 0.75, unit_price: 80 },
    { name: "Heating element", quantity: 1, unit_price: 15 },
  ],
  tax_rate: null,
  total: 75,
  uncertain: ["Heating element price said as 'fifteen' then 'make that fifteen dollars'; the correction is odd, possibly it was another number (e.g. fifty); used $15"],
};

/** What the speaker really said, so the flow and the tests share one set of numbers. */
export const SAMPLE_AMOUNTS = {
  laborCents: 6_000,
  heardElementCents: 1_500,
  spokenElementCents: 5_000,
  heardTotalCents: 7_500,
  spokenTotalCents: 11_000,
};
