/**
 * What's wrong with what the person typed, in plain words. Shared by the confirm screen and its
 * tests. A line that can't be read is never left out of the total quietly: the screen names the
 * field, holds the total, and Send says what to fix.
 */
import { formatCents, MAX_QUANTITY_MILLI, MAX_TAX_RATE_MILLI, MAX_UNIT_CENTS, parseDollars, parsePercent, parseQuantity } from "./money";

export type LineField = "name" | "quantity" | "price";

export interface InputProblem {
  /** Where the person fixes it: a line's field, or a job field. */
  field: LineField | "tax" | "due" | "customer-name" | "customer-email";
  /** 1-based, for lines. */
  line?: number;
  lineKey?: string;
  /** Shown on the field itself. */
  text: string;
  /** Shown on the Send bar: "Fix the price on line 2". */
  fix: string;
}

const NEGATIVE = /^\s*-/;
const NUMBERISH = /^\s*-?\$?[\d,]*\.?\d*\s*$/;
const TOO_MANY_DIGITS = /^\s*\$?\d[\d,]{9,}/;

export function priceProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "Enter a price.";
  if (NEGATIVE.test(text)) return "A price can't be below $0. Enter a price above $0, or remove this item.";
  if (TOO_MANY_DIGITS.test(text)) return `That's more than ${formatCents(MAX_UNIT_CENTS)} for one item. Check the price.`;
  if (!NUMBERISH.test(text)) return `"${text}" isn't a price. Enter a number, like 85.00.`;
  const cents = parseDollars(text);
  if (cents === null) return /\.\d{3,}/.test(text) ? "Prices go to the cent, like 85.50." : `"${text}" isn't a price. Enter a number, like 85.00.`;
  if (cents === 0) return "Enter a price above $0, or remove this item.";
  if (cents > MAX_UNIT_CENTS) return `That's more than ${formatCents(MAX_UNIT_CENTS)} for one item. Check the price.`;
  return null;
}

const MAX_QUANTITY = MAX_QUANTITY_MILLI / 1000;

export function quantityProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "Enter a quantity, like 1.";
  if (NEGATIVE.test(text)) return "A quantity can't be below 0. Enter 1 or more, or remove this item.";
  if (TOO_MANY_DIGITS.test(text)) return `That's more than ${MAX_QUANTITY.toLocaleString("en-US")}. Check the quantity.`;
  if (!/^\s*[\d,]*\.?\d*\s*$/.test(text)) return `"${text}" isn't a quantity. Write a plain number, like 2 or 1.5.`;
  const milli = parseQuantity(text);
  if (milli === null) return /\.\d{4,}/.test(text) ? "Use at most 3 decimals, like 0.75." : `"${text}" isn't a quantity. Write a plain number, like 2 or 1.5.`;
  if (milli === 0) return "Enter a quantity above 0, or remove this item.";
  if (milli > MAX_QUANTITY_MILLI) return `That's more than ${MAX_QUANTITY.toLocaleString("en-US")}. Check the quantity.`;
  return null;
}

export function taxProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null; // blank is no tax
  if (NEGATIVE.test(text)) return "Tax can't be below 0%.";
  const rate = parsePercent(text.replace(/%$/, ""));
  if (rate === null) return `"${text}" isn't a tax rate. Enter a percent, like 7 or 8.25.`;
  if (rate > MAX_TAX_RATE_MILLI) return `Tax above ${MAX_TAX_RATE_MILLI / 1000}% isn't a sales tax rate. Check it.`;
  return null;
}

/** The plain test for an email that could be sent to at all. The allowlist is a separate check. */
export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export interface DraftInput {
  lines: { key: string; name: string; quantity: string; price: string }[];
  taxPercent: string;
  dueDate: string;
  customer: { name: string; email: string };
}

const FIELD_WORD: Record<LineField, string> = { name: "name", quantity: "quantity", price: "price" };

/** Every problem on the screen, in the order a person would meet them. */
export function inputProblems(draft: DraftInput): InputProblem[] {
  const problems: InputProblem[] = [];
  draft.lines.forEach((line, i) => {
    const at = { line: i + 1, lineKey: line.key };
    const add = (field: LineField, text: string | null) => {
      if (text) problems.push({ field, ...at, text, fix: `Fix the ${FIELD_WORD[field]} on line ${i + 1}` });
    };
    add("name", line.name.trim() ? null : "Give this item a name.");
    add("quantity", quantityProblem(line.quantity));
    add("price", priceProblem(line.price));
  });
  if (!draft.lines.length) problems.push({ field: "name", text: "Add at least one item.", fix: "Add an item" });
  const tax = taxProblem(draft.taxPercent);
  if (tax) problems.push({ field: "tax", text: tax, fix: "Fix the tax rate" });
  if (!draft.dueDate) problems.push({ field: "due", text: "Pick a due date.", fix: "Pick a due date" });
  if (!draft.customer.name.trim()) problems.push({ field: "customer-name", text: "Add the customer's name.", fix: "Add the customer's name" });
  if (!draft.customer.email.trim()) problems.push({ field: "customer-email", text: "Add the customer's email.", fix: "Add the customer's email" });
  else if (!looksLikeEmail(draft.customer.email)) problems.push({ field: "customer-email", text: `"${draft.customer.email.trim()}" isn't an email address.`, fix: "Fix the customer email" });
  return problems;
}

/** The Send bar's reason: the first problem, and how many more there are. */
export function sendBlockedBy(problems: InputProblem[]): string | null {
  if (!problems.length) return null;
  const more = problems.length - 1;
  return more ? `${problems[0].fix} (and ${more} more)` : problems[0].fix;
}
