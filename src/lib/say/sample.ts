/**
 * The "Try a sample job": a real ElevenLabs Scribe v2 transcript of a computer voice with road
 * noise, and the real Sonnet extraction of it (TK-43 fresh-2, job09, noisy, frozen prompt). The
 * speaker said "fifty", speech heard "fifteen", and the extraction flagged it. That is the exact
 * trap the confirm screen exists to catch. The customer's name in it is changed from the one the
 * clip says; names never come from speech anyway. The clip itself stays out of this repo: macOS system
 * voices can't be redistributed. Every demo amount lives here.
 */

export const SAMPLE_CONTACT_ID = "derek-evans";

export const SAMPLE_TRANSCRIPT =
  "Derek Evans, the dryer would not heat. I was there three quarters of an hour at eighty an hour. New heating element, fifteen. No wait, make that fifteen dollars. No tax on this one. It runs hot again and the vent is clear.";

export const SAMPLE_EXTRACTION = {
  customer: "Derek Evans",
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

/**
 * The description step's reading of the sample, by line name. Written in the sample's own words, so
 * the word check has nothing to flag. Nothing said where, so no job site, and no day, so no date.
 */
export const SAMPLE_DESCRIPTION = {
  job_summary: "Dryer would not heat: new heating element, runs hot again",
  job_site: "",
  service_date: "",
  service_date_words: "",
  lines: {
    Labor: "Three quarters of an hour on the dryer that would not heat. It runs hot again and the vent is clear.",
    "Heating element": "New heating element for the dryer",
  } as Record<string, string>,
};

/**
 * A made-up job for the tax tests on mock AI: tax said with no rate, after one item only, and the
 * state heard as "lowa" the way speech to text writes it. Pump $85 taxed, labor 1.5 h at $70 not.
 */
export const PLUS_TAX_TRANSCRIPT =
  "Swapped the drain pump on the washer at 12 Oak Lane on October 30th. The pump was eighty-five dollars plus tax for lowa, and labor was an hour and a half at seventy an hour.";

export const PLUS_TAX_EXTRACTION = {
  customer: "",
  service_address: "12 Oak Lane",
  line_items: [
    { name: "Drain pump", quantity: 1, unit_price: 85 },
    { name: "Labor", quantity: 1.5, unit_price: 70 },
  ],
  tax_rate: null,
  total: 190,
  uncertain: [],
};

export const PLUS_TAX_DESCRIPTION = {
  job_summary: "Washer drain pump swapped",
  job_site: "12 Oak Lane",
  service_date: "10-30",
  service_date_words: "October 30th",
  lines: {
    "Drain pump": "Drain pump for the washer",
    Labor: "Swapped the drain pump on the washer, an hour and a half",
  } as Record<string, string>,
};

/** Pump $85.00 and labor $105.00; tax on the pump only. */
export const PLUS_TAX_AMOUNTS = { pumpCents: 8_500, laborCents: 10_500, tax7Cents: 595, total7Cents: 19_595, tax6Cents: 510, total6Cents: 19_510 };

/**
 * A working roofer's real job, as they said it. On mock AI it reads the way the live run read it
 * when the roofer's invoice first went out, so the proof can be re-sent without paying for AI.
 * The numbers are the roofer's: $400 labor, flat, and $200 material.
 */
export const ROOFER_TRANSCRIPT =
  "Okay. Roof leak repair, um, valley replacement, um, laminated shingles approximately 10 years old. Um, remove shingles, um, rebase, um, break out at top, um, put in, uh, ice and water guard underlayment AKA Bituthene. Um, replace shingles with a valley liner and tie into existing seal old to new. Um, approximately three and a half hours, uh, four hundred dollars labor and, uh, two hundred dollars material. Mm-hmm.";

/** The roofer's customer is made up: an example.com address, so it can go through the sandbox. */
export const ROOFER_CUSTOMER = { name: "Pat Rivera", email: "pat.rivera@example.com" };

export const ROOFER_EXTRACTION = {
  customer: "",
  service_address: null,
  line_items: [
    { name: "Labor", quantity: 1, unit_price: 400 },
    { name: "Material", quantity: 1, unit_price: 200 },
  ],
  tax_rate: null,
  total: 600,
  uncertain: [],
};

export const ROOFER_DESCRIPTION = {
  job_summary: "Roof leak repair: valley replacement on laminated shingles approximately 10 years old.",
  job_site: "",
  service_date: "",
  service_date_words: "",
  lines: {
    Labor: "Remove shingles, rebase, break out at top, put in ice and water guard underlayment, replace shingles with a valley liner and tie into existing seal old to new. Approximately three and a half hours.",
    Material: "Laminated shingles approximately 10 years old, ice and water guard underlayment AKA Bituthene, valley liner.",
  } as Record<string, string>,
};

export const ROOFER_AMOUNTS = { laborCents: 40_000, materialCents: 20_000, totalCents: 60_000 };
