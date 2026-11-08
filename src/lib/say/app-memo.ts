/**
 * The private memo on every invoice this app sends. PayPal shows a memo to the invoicer only, never
 * to the customer. It lets "Learn from my PayPal invoices" tell the trade's own history from what
 * was sent here, straight from PayPal's list, from any browser.
 */
export const APP_MEMO = "Sent with Say-Voice";

export const sentByApp = (invoice: { detail: { memo?: string } }) => invoice.detail.memo?.startsWith(APP_MEMO) ?? false;
