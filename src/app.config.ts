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
  repoUrl: "",
  videoUrl: "",

  nav: [
    { label: "Jobs", href: "/jobs" },
    { label: "Activity", href: "/activity" },
  ],

  landing: {
    eyebrow: "For plumbers, electricians and anyone who bills from the van",
    headline: "Say the job. Send the invoice.",
    subheadline:
      "Tradespeople invoice late because the paperwork happens at night. Say-Voice turns a few seconds of speech into a real PayPal invoice, and you check every number before it goes.",
    primaryCta: { label: "Start a job", href: "/jobs" },
    secondaryCta: { label: "How it works", href: "#how" },
    steps: [
      { title: "Pick the customer", body: "Choose them from your contacts or type the name. Speech can't be trusted for names, so it never picks one." },
      { title: "Say the job", body: "Press record and talk it through: hours, parts, prices, tax. AI turns it into line items." },
      { title: "Check and send", body: "Every number sits next to what you said. You fix anything flagged, press send, and PayPal delivers the invoice." },
    ],
    features: [
      { title: "You check every number", body: "The words you said sit beside each price, and anything doubtful is flagged by name. Nothing goes out on its own." },
      { title: "Totals come from code", body: "AI reads the job. Line totals, tax and the invoice total are worked out in whole cents, the same way PayPal does." },
      { title: "A real PayPal invoice", body: "The customer gets a PayPal invoice they can pay right away, and the app shows the number and status PayPal reports." },
    ],
  },

  /** Guard policy (merged over DEFAULT_POLICY). Sending an invoice always waits for the person. */
  agentPolicy: {
    approvalThreshold: "0",
    maxPerAction: "5000.00",
    maxPerDay: "20000.00",
    requireApprovalFor: ["send_job_invoice", "accept_dispute_claim"],
  } satisfies Partial<GuardPolicy>,
};

export type AppConfig = typeof appConfig;
