/** For an unpaid invoice: reads it from PayPal, writes the note, and puts it to the person. */
import { appConfig } from "@/app.config";
import { defineAgent, type ScriptStep } from "@/lib/agent/define";
import { READ_JOB_INVOICE, readJobInvoice, SEND_PAYMENT_REMINDER, sendPaymentReminder } from "./tools/job-reminder";

export const reminderAgent = defineAgent({
  id: "payment-reminder",
  name: "Reminder agent",
  description: "Drafts a payment reminder for an unpaid invoice and sends it only once the person approves.",
  system: `You write payment reminders for a one-person trades business. The customer knows them, so sound like them: short, plain and friendly.

Call ${READ_JOB_INVOICE} first. If can_remind is false, say why_not in one sentence and stop.

Otherwise call ${SEND_PAYMENT_REMINDER} once. The note is one to three short sentences that use the customer's first name, the invoice number and amount_due exactly as given. Say the customer can pay from PayPal's email. If days_past_due is above zero, say it is past due. If reminders_sent is above zero, say this is a follow-up.

If person_asked is set, the person who did the job asked you to add that, so put it in the note as they asked. Code checks every note against PayPal's invoice before the person sees it.

Otherwise don't write links, discounts, late fees, threats, deadlines, or anything else the tool result didn't tell you.

If the tool refuses the note, fix what it names and call it once more. If the person declines, stop: don't offer another note. Finish with one short sentence saying what happened.`,
  tools: () => [readJobInvoice, sendPaymentReminder],
  policy: appConfig.agentPolicy,
  effort: "low",
  maxTurns: 5,
  mockScript: (input) => {
    const job_id = input.context?.job_id as string;
    const ask = (input.context?.ask as string | undefined)?.trim();
    // Does what the person asked, as the model does. Code refuses a figure PayPal's invoice doesn't have, so the second try leaves it out.
    const asked: ScriptStep[] = ask
      ? [{ tool: SEND_PAYMENT_REMINDER, input: ({ invoice }) => ({ job_id, note: `Hi ${invoice.customer_first_name}, invoice ${invoice.invoice_number} for ${invoice.amount_due} is still open. ${ask.replace(/^add (an? )?/i, "There is also a ").replace(/\.?$/, ".")}` }) }]
      : [];
    return [
      { tool: READ_JOB_INVOICE, input: { job_id }, as: "invoice" },
      ...asked,
      {
        tool: SEND_PAYMENT_REMINDER,
        input: ({ invoice }) => ({ job_id, note: `Hi ${invoice.customer_first_name}, a friendly reminder that invoice ${invoice.invoice_number} for ${invoice.amount_due} is still open. You can pay it from PayPal's email. Thanks!` }),
      },
    ];
  },
});
