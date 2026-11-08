/** PayPal's invoice update replaces the whole invoice. This is the part of a read invoice that can be sent back. */
import type * as T from "./types";

export function invoiceReplaceBody(invoice: T.Invoice, change: Partial<Pick<T.CreateInvoiceRequest, "items">> & { detail?: Partial<T.CreateInvoiceRequest["detail"]> } = {}): T.CreateInvoiceRequest {
  const { metadata: _readOnly, ...detail } = invoice.detail;
  void _readOnly;
  return {
    detail: { ...detail, ...change.detail },
    ...(invoice.invoicer ? { invoicer: invoice.invoicer } : {}),
    ...(invoice.primary_recipients ? { primary_recipients: invoice.primary_recipients } : {}),
    ...(invoice.additional_recipients ? { additional_recipients: invoice.additional_recipients } : {}),
    ...(invoice.configuration ? { configuration: invoice.configuration } : {}),
    items: change.items ?? invoice.items,
  };
}
