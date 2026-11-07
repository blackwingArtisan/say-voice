/**
 * Invoice arithmetic in integer cents. Shared by the browser (live totals on the confirm screen)
 * and the server (the amount that is approved and sent). The AI never states a total: Sonnet got
 * it wrong on 6 of 20 clips.
 *
 * The rounding copies what the PayPal sandbox does, checked with throwaway drafts on 2026-11-01:
 * each line rounds half-up to cents, tax is worked out per line on the rounded line and rounds
 * half-up, and the total is the sum. So 3 x $10.10 at 7.25% is $2.19 tax, not the $2.20 you get
 * by taxing the whole sum. Taxing the sum would leave the screen a cent away from the invoice.
 */

export interface InvoiceLine {
  name: string;
  /** Thousandths of a unit, so 1.5 hours is 1500. */
  quantityMilli: number;
  unitCents: number;
  /** False leaves this line out of the tax. Missing means taxed, as every line was before. */
  taxed?: boolean;
}

export interface LineTotal {
  lineCents: number;
  taxCents: number;
}

export interface InvoiceTotals {
  lines: LineTotal[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export const MAX_QUANTITY_MILLI = 10_000_000;
export const MAX_UNIT_CENTS = 10_000_000;
export const MAX_TAX_RATE_MILLI = 30_000;

/** a / b rounded half-up, for non-negative safe integers. */
function divideRounded(a: number, b: number): number {
  const quotient = Math.floor(a / b);
  return 2 * (a - quotient * b) >= b ? quotient + 1 : quotient;
}

export function lineCents(line: Pick<InvoiceLine, "quantityMilli" | "unitCents">): number {
  return divideRounded(line.quantityMilli * line.unitCents, 1000);
}

/** taxRateMilli is the percent in thousandths, so 8.875% is 8875 and 0 means no tax. */
export function computeTotals(lines: Pick<InvoiceLine, "quantityMilli" | "unitCents" | "taxed">[], taxRateMilli: number): InvoiceTotals {
  const rows = lines.map((line) => {
    const cents = lineCents(line);
    return { lineCents: cents, taxCents: line.taxed === false ? 0 : divideRounded(cents * taxRateMilli, 100_000) };
  });
  const subtotalCents = rows.reduce((sum, r) => sum + r.lineCents, 0);
  const taxCents = rows.reduce((sum, r) => sum + r.taxCents, 0);
  return { lines: rows, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** AI numbers arrive as floats, and this is the only place they turn into cents. */
export const dollarsToCents = (dollars: number) => Math.max(0, Math.round(dollars * 100));
export const unitsToMilli = (units: number) => Math.max(0, Math.round(units * 1000));
export const percentToRateMilli = (percent: number | null) => (percent === null ? 0 : Math.max(0, Math.round(percent * 1000)));

/** "12.5" with up to `places` decimals, as an integer scaled by 10^places. Null if it isn't one. */
function parseScaled(text: string, places: number): number | null {
  const match = new RegExp(`^(\\d{1,9})(?:\\.(\\d{0,${places}}))?$`).exec(text.trim().replace(/^\$/, "").replace(/,/g, ""));
  if (!match) return null;
  return Number(match[1]) * 10 ** places + Number((match[2] ?? "").padEnd(places, "0") || 0);
}

export const parseDollars = (text: string) => parseScaled(text, 2);
export const parseQuantity = (text: string) => parseScaled(text, 3);
export const parsePercent = (text: string) => parseScaled(text, 3);

const plainDecimal = (scaled: number, places: number) => (scaled / 10 ** places).toFixed(places);
const trimZeros = (text: string) => text.replace(/\.?0+$/, "");

/** "150.00", the string PayPal takes. */
export const centsToValue = (cents: number) => plainDecimal(cents, 2);
export const formatCents = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatQuantity = (milli: number) => trimZeros(plainDecimal(milli, 3));
export const formatRate = (rateMilli: number) => trimZeros(plainDecimal(rateMilli, 3));
