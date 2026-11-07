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
  ],

  landing: {
    eyebrow: "For one-person trades who bill from the van: plumbers, roofers, appliance techs",
    headline: "Say the job. Send the invoice.",
    subheadline:
      "You say the job in the van, check each number against your own words, and a PayPal invoice goes out before you drive off. Speech is never trusted with money: code does every sum.",
    proof: [
      { figure: "6 of 20", body: "test clips where an AI model stated a wrong total. Here code adds up every cent, and the AI never states one." },
      { figure: "$600", body: "a real roofer's job, sent through PayPal's sandbox with what was fixed on every line (below, as the customer saw it)." },
    ],
    whyNot: "Why not Housecall Pro or Jobber? No suite to set up. Your words sit beside every number, a price book stops a wrong price whoever said it, and nothing reaches a customer until you approve the exact amount.",
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
