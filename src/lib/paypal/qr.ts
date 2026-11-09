/**
 * PayPal's generate-qr-code answer. PayPal sends it as multipart/form-data with one part, "image",
 * holding the PNG as base64 text (and refuses Accept: application/json with a 406). This takes the
 * PNG out of that, or out of a bare base64 string.
 */
import { PayPalApiError } from "./errors";

/** The QR code's width and height in pixels, as asked of PayPal. */
export const QR_SIZE = 300;

const PNG_BASE64 = /iVBORw0KGgo[A-Za-z0-9+/=\r\n]*/;

export function qrPngFrom(raw: unknown): string {
  const png = typeof raw === "string" ? PNG_BASE64.exec(raw)?.[0].replace(/\s/g, "") : undefined;
  if (!png) throw new PayPalApiError({ status: 502, name: "UNEXPECTED_RESPONSE", message: "PayPal's QR code answer had no PNG in it." });
  return png;
}
