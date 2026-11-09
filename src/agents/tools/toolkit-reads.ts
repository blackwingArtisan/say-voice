/**
 * The reminder agent's reads through PayPal's Agent Toolkit: its own search_invoicing and get_invoice
 * tools, with the toolkit's validators and, on the sandbox, its own PayPalAPI client. Each call goes
 * through the Guard like any agent tool. The scope is this app's job invoices: an id or number that
 * isn't on a job here is refused before PayPal is asked, and a search only gives back job invoices.
 * The result is cut to what a note needs, so the agent sees the work done but not the unit prices.
 */
import { toolkitTools } from "@/lib/agent/tools/toolkit";
import type { AgentTool } from "@/lib/agent/tool";
import { getEnv } from "@/lib/env";
import { listStoredJobs } from "@/lib/say/jobs";

export const SEARCH_INVOICING = "search_invoicing";
export const GET_INVOICE = "get_invoice";

type Args = Record<string, unknown>;

interface RawInvoice {
  id?: string;
  status?: string;
  detail?: { invoice_number?: string; payment_term?: { due_date?: string } };
  amount?: { value?: string; currency_code?: string };
  due_amount?: { value?: string };
  items?: { name?: string; quantity?: string }[];
}

const jobInvoices = () => listStoredJobs().flatMap((job) => (job.invoice ? [job.invoice] : []));
const NOT_OURS = "That invoice isn't on a job in this app. Only this app's job invoices can be read here.";

/** What the agent gets back: the invoice as PayPal has it, minus the unit prices. */
export function invoiceSummary(raw: RawInvoice) {
  return {
    invoice_id: raw.id,
    invoice_number: raw.detail?.invoice_number,
    status: raw.status,
    total: raw.amount?.value ? `$${raw.amount.value}` : undefined,
    amount_due: raw.due_amount?.value ? `$${raw.due_amount.value}` : undefined,
    due_date: raw.detail?.payment_term?.due_date,
    work: raw.items?.map((item) => (item.quantity && item.quantity !== "1" ? `${item.name} × ${item.quantity}` : item.name)),
  };
}

/** Narrows a toolkit tool: a check before it runs and a cut of what it gives back. */
function scoped(tool: AgentTool, check: (input: Args) => void, cut: (result: unknown) => unknown, description: string): AgentTool {
  return {
    ...tool,
    description: `${description} (PayPal Agent Toolkit's ${tool.name}.)`,
    execute: async (input, ctx) => {
      check(input as Args);
      return cut(await tool.execute(input, ctx));
    },
  };
}

export function toolkitReads(mode: "mock" | "sandbox" = getEnv().paypalMode === "sandbox" ? "sandbox" : "mock"): AgentTool[] {
  const [search, get] = toolkitTools([SEARCH_INVOICING, GET_INVOICE], mode);
  return [
    scoped(
      search,
      (input) => {
        const number = (input.invoice_filters as { invoice_number?: string } | undefined)?.invoice_number;
        if (input.resource_type !== "invoice" || !number) throw new Error("Search by invoice_filters.invoice_number, with resource_type invoice.");
        if (!jobInvoices().some((inv) => inv.number === number)) throw new Error(NOT_OURS);
      },
      (result) => {
        const ids = new Set(jobInvoices().map((inv) => inv.id));
        const items = ((result as { items?: RawInvoice[] } | null)?.items ?? []).filter((inv) => inv.id && ids.has(inv.id));
        return { invoices: items.map(invoiceSummary) };
      },
      "Find a job's invoice on PayPal by its invoice number. Gives back its invoice_id for get_invoice.",
    ),
    scoped(
      get,
      (input) => {
        if (!jobInvoices().some((inv) => inv.id === input.invoice_id)) throw new Error(NOT_OURS);
      },
      (result) => invoiceSummary((result ?? {}) as RawInvoice),
      "Read a job's invoice from PayPal by invoice_id: its status, amount due and the work on it.",
    ),
  ];
}
