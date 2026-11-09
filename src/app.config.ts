/**
 * APP-OWNED: identity, copy and policy for this app. scripts/new-app.sh rewrites the lines
 * marked `kit:` — keep those markers. Everything here is safe to show in the browser.
 */
import type { GuardPolicy } from "@/lib/agent/policy";

export const appConfig = {
  name: "Say-Voice", // kit:name
  slug: "say-voice", // kit:slug
  brandColor: "#c2410c", // kit:brand
  brandForeground: "#FFFFFF", // kit:brand-foreground
  tagline: "Say the job in the van. Send the invoice before you drive off.",
  description: "Dictate a job, check every number against what you said, and send a real PayPal invoice in seconds.",
  /** The made-up trade business the demo invoices come from. The customer sees it at the top of PayPal's page. */
  tradeName: "Ridgeline Home Repair",
  repoUrl: "https://github.com/blackwingArtisan/say-voice",
  videoUrl: "", // link added at submission

  nav: [
    { label: "Jobs", href: "/jobs" },
    { label: "Prices", href: "/prices" },
    { label: "Activity", href: "/activity" },
    { label: "How it works", href: "/#how" },
  ],

  landing: {
    eyebrow: "For one-person trades who bill from the van: plumbers, roofers, appliance techs",
    /**
     * The lead is billing accuracy: the trades' distrust of AI, from round4/research/say-voice.md,
     * section 2, pain point 4 (ServiceTitan 2026, via PHCP Pros, n>1,000; the method isn't described,
     * and ServiceTitan sells AI to the trades). The statement above it is ours, not a statistic.
     */
    lead: {
      statement: "One wrong number on an invoice can cost you the customer.",
      figure: "58%",
      body: "of US residential contractors have little or no trust in the AI tools they use. Only 11% trust them highly.",
      source: { label: "ServiceTitan 2026 State of AI in the Trades, via PHCP Pros (n>1,000)", href: "https://www.phcppros.com/articles/24198-servicetitan-report-finds-ai-adoption-accelerating-across-the-trades" },
    },
    /** Who it's for (research section 1). Census counts the whole construction sector, so it says "construction businesses". */
    who: {
      figure: "2.9 million",
      body: "US construction businesses have no employees, so the person who does the job also writes the bill.",
      source: { label: "US Census Bureau, 2022 Nonemployer Statistics", href: "https://www.census.gov/library/stories/2025/05/smallest-businesses.html" },
    },
    /** The catch, as the sample job's confirm screen shows it. */
    catch: {
      title: "Fifteen or fifty? Code checks it against your PayPal invoices.",
      said: "New heating element, fifteen. No wait, make that fifteen dollars.",
      item: "Heating element",
      heardCents: 1500,
      usualCents: 5000,
      note: "As the sample job shows it. The usual price comes from the trade's past PayPal invoices, read with GET /v2/invoicing/invoices. Plain code compares them, not AI, and the invoice can't go until you pick one.",
    },
    /** The headline idea: a price far from your own PayPal invoices waits for you, whether misheard or misspoken. */
    headline: "Said fifteen, usually fifty? Your PayPal invoices catch it.",
    subheadline:
      "Say the job in the van. When a price you said is far from what your own past PayPal invoices charged for it, misheard or misspoken, the invoice waits and you pick. Code does every sum, and the invoice goes out once you approve the exact amount.",
    proof: [
      { figure: "6 of 20", body: "test clips where an AI model stated a wrong total. Here code adds up every cent, and the AI never states one.", href: "#method" },
      { figure: "$600", body: "a real roofer's job, sent through PayPal's sandbox with what was fixed on every line, as the customer's PayPal page shows it on the home page." },
    ],
    /**
     * Both have a price list of their own (their pages, re-read 2026-11-08). What's different here is
     * where the prices come from, your past PayPal invoices, and that a spoken price is checked against them.
     */
    whyNot: {
      text: "Why not Housecall Pro or Jobber? Both have a price list of their own. We couldn't find one built from your past PayPal invoices, or one that checks a price you said against them.",
      sources: [
        { label: "Housecall Pro price book", href: "https://www.housecallpro.com/features/price-book/" },
        { label: "Jobber Products & Services list", href: "https://help.getjobber.com/en/articles/products-services-list/" },
      ],
    },
    /**
     * Real jobs: only what the saved proof shows (the confirm screens and the customers' PayPal pages
     * from the live-AI runs on 2026-11-07). No quotes, no real names, no addresses. Time from
     * stop-record to sent wasn't measured, so it isn't claimed.
     */
    realJobs: {
      title: "Real jobs",
      intro: "Two jobs said out loud by the people who did them, read by ElevenLabs Scribe and Claude Sonnet, sent as PayPal sandbox invoices on 7 Nov 2026. Customer names on the invoices are made up.",
      jobs: [
        {
          trade: "Roofer",
          job: "Roof leak repair, valley replacement",
          total: "$600.00",
          invoice: "PayPal sandbox invoice #0134",
          lines: "2 of 2 lines right first time: Labor $400.00 flat, Material $200.00.",
          caught: [
            "Asked whether $400 was for the job or by the hour, since three and a half hours was said too. By the hour, the total would have been $1,600.",
            "Pointed out that the $200 material was one lump sum, not itemized.",
          ],
        },
        {
          trade: "Appliance tech",
          job: "Dryer repair: new part and two hours' labor",
          total: "$472.03",
          invoice: "PayPal sandbox invoice #0135",
          lines: "2 of 2 lines right first time: the part $329.00 taxed, labor 2 h at $60.00.",
          caught: [
            "Tax was said with no rate. Speech spelled Iowa with a lowercase L (\u201clowa\u201d); it still found Iowa's rates from the state tables, and 7% was picked.",
            "The street address came through split by speech and was read back joined, for a check.",
            "The part wasn't named, so it was listed as \u201cDryer part\u201d with a note to check.",
          ],
        },
      ],
    },
    /**
     * Late payment, from round4/research/say-voice.md, section 2 (pain points 1 and 2). It is what the
     * reminders answer, so it sits under them on a sent job, not at the top of the page.
     */
    latePayment: [
      {
        figure: "56%",
        body: "of US small businesses are owed money on unpaid invoices, $17.5K on average.",
        source: { label: "QuickBooks Small Business Late Payments Report 2025 (n=2,487, all industries)", href: "https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/" },
      },
      {
        figure: "49%",
        body: "of construction payments are not made on time.",
        source: { label: "Levelset with QuickBooks Time, 2019 (n=503, mostly contractors and subcontractors)", href: "https://levelset.com/blog/2019-national-construction-payments-report" },
      },
    ],
    method:
      "10 made-up jobs from five trades, each spoken by a text-to-speech voice twice (clean, and with background noise), make 20 clips. Chrome's speech recognition wrote them down and Claude Sonnet returned the line items and a total. On 6 of the 20 the stated total was wrong, though the model's own line items added up right. With code doing the sum, 0 of 20 were wrong. A small, synthetic sample, run on 2026-11-01: it shows this happens, not how often.",
    primaryCta: { label: "Start a job", href: "/jobs" },
    secondaryCta: { label: "How it works", href: "#how" },
    steps: [
      { title: "Say the job", body: "Press record first and talk it through: hours, parts, prices, tax. AI turns it into line items." },
      { title: "Pick the customer", body: "Before or after, from your contacts or by typing the name. Speech can't be trusted for names, so it never picks one." },
      { title: "Check and send", body: "Every number sits next to what you said. You fix anything flagged, press send, and PayPal delivers the invoice." },
    ],
  },

  /** Guard policy (merged over DEFAULT_POLICY). Sending an invoice always waits for the person. */
  agentPolicy: {
    approvalThreshold: "0",
    maxPerAction: "5000.00",
    maxPerDay: "20000.00",
    requireApprovalFor: ["send_job_invoice", "send_payment_reminder", "accept_dispute_claim"],
  } satisfies Partial<GuardPolicy>,
};

export type AppConfig = typeof appConfig;
