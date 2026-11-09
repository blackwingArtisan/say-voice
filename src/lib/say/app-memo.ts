/**
 * The private memo on every invoice this app sends. PayPal shows a memo to the invoicer only, never
 * to the customer. It lets "Learn from my PayPal invoices" tell the trade's own history from what
 * was sent here, straight from PayPal's list, from any browser.
 */
export const APP_MEMO = "Sent with Say-Voice";

export const sentByApp = (invoice: { detail: { memo?: string } }) => invoice.detail.memo?.startsWith(APP_MEMO) ?? false;

/**
 * The app's sends from before they carried the memo: descriptions written on the lines and no item
 * dates. The trade's own past invoices here carry item dates. Still skipped, so the sample job
 * sent over and over can't pass for the trade's history.
 */
export const sentByAppBeforeMemo = (invoice: { detail: { memo?: string }; items?: { description?: string; item_date?: string }[] }) =>
  !invoice.detail.memo && !!invoice.items?.length && invoice.items.every((item) => !item.item_date) && invoice.items.some((item) => !!item.description?.trim());
