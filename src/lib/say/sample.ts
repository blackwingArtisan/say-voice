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

/** What the demo tradesperson usually charges, so the price book has something to say on day one. */
export const SEED_PRICES: { name: string; samples: number[] }[] = [
  { name: "Labor", samples: [7500, 8000, 8000, 8500, 9000] },
  { name: "Heating element", samples: [4500, 5000, 5000, 5200, 5500] },
  { name: "Service call", samples: [8500, 9500, 9500, 9500, 11000] },
  { name: "Wax ring", samples: [1200, 1200, 1400] },
  { name: "Thermostat", samples: [6000, 6500, 7000] },
  { name: "Disposal fee", samples: [2500, 2500, 3000] },
  { name: "Faucet cartridge", samples: [3200, 3500, 3800] },
];
