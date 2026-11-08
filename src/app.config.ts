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
  repoUrl: "",
  videoUrl: "",

  nav: [
    { label: "Jobs", href: "/jobs" },
    { label: "Prices", href: "/prices" },
    { label: "Activity", href: "/activity" },
    { label: "How it works", href: "/#how" },
  ],

  landing: {
    eyebrow: "For one-person trades who bill from the van: plumbers, roofers, appliance techs",
    /** The researched headline (round4/research/say-voice.md, section 1). Census counts the whole construction sector, so it says "construction businesses". */
    lead: {
      figure: "2.9 million",
      body: "US construction businesses have no employees, so the person who does the job also writes the bill.",
      source: { label: "US Census Bureau, 2022 Nonemployer Statistics", href: "https://www.census.gov/library/stories/2025/05/smallest-businesses.html" },
    },
    headline: "Say the job. Send the invoice.",
    subheadline:
      "You say the job in the van, check each number against your own words, and a PayPal invoice goes out before you drive off. Speech is never trusted with money: code does every sum.",
    proof: [
      { figure: "6 of 20", body: "test clips where an AI model stated a wrong total. Here code adds up every cent, and the AI never states one.", href: "#method" },
      { figure: "$600", body: "a real roofer's job, sent through PayPal's sandbox with what was fixed on every line (below, as the customer's PayPal page shows it)." },
    ],
    whyNot: "Why not Housecall Pro or Jobber? No suite to set up. Your words sit beside every number, a price book stops a wrong price whoever said it, and nothing reaches a customer until you approve the exact amount.",
    /** From round4/research/say-voice.md, section 2. Every figure was re-opened at its source. */
    pains: [
      {
        figure: "56%",
        title: "Money sits in unpaid invoices",
        body: "of US small businesses are owed money on unpaid invoices, $17.5K on average. 47% have invoices more than 30 days overdue.",
        source: { label: "QuickBooks Small Business Late Payments Report 2025 (n=2,487, all industries)", href: "https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/" },
        answer: "The invoice goes out at the end of the job, from the van, with a pay link the customer can use straight away.",
      },
      {
        figure: "49%",
        title: "Construction gets paid late",
        body: "of construction payments are not made on time, and 61% of firms report cash-flow problems.",
        source: { label: "Levelset with QuickBooks Time, 2019 (n=503, mostly contractors and subcontractors)", href: "https://levelset.com/blog/2019-national-construction-payments-report" },
        answer: "It can't make a customer pay faster. It removes the wait on the trade's side: no invoice left for later.",
      },
      {
        figure: "58%",
        title: "The trades don't trust AI with the details",
        body: "of US residential contractors have little or no trust in the AI tools they use. Only 11% trust them highly.",
        source: { label: "ServiceTitan 2026 State of AI in the Trades, via PHCP Pros (n>1,000)", href: "https://www.phcppros.com/articles/24198-servicetitan-report-finds-ai-adoption-accelerating-across-the-trades" },
        answer: "So the AI only listens. Code does every sum, a price book stops a wrong price, and nothing goes out until the person approves it.",
      },
    ],
    method:
      "10 made-up jobs from five trades, each spoken by a text-to-speech voice twice (clean, and with background noise), make 20 clips. Chrome's speech recognition wrote them down and Claude Sonnet returned the line items and a total. On 6 of the 20 the stated total was wrong, though the model's own line items added up right. With code doing the sum, 0 of 20 were wrong. A small, synthetic sample, run on 2026-11-01: it shows this happens, not how often.",
    primaryCta: { label: "Start a job", href: "/jobs" },
    secondaryCta: { label: "How it works", href: "#how" },
    steps: [
      { title: "Pick the customer", body: "Choose them from your contacts or type the name. Speech can't be trusted for names, so it never picks one." },
      { title: "Say the job", body: "Press record and talk it through: hours, parts, prices, tax. AI turns it into line items." },
      { title: "Check and send", body: "Every number sits next to what you said. You fix anything flagged, press send, and PayPal delivers the invoice." },
    ],
    features: [
      { title: "You check every number", body: "The words you said sit beside each price, and anything doubtful is flagged by name. Nothing goes out on its own." },
      { title: "It knows your usual prices", body: "Fifty misheard as fifteen is caught by plain code, which stops the invoice and shows what that part usually costs." },
      { title: "A real PayPal invoice", body: "The customer gets a PayPal invoice they can pay right away. The job turns paid by itself, and if it doesn't, an agent drafts a reminder for you to approve." },
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
