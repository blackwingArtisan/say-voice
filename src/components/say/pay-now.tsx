"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, ExternalLink } from "lucide-react";
import { JudgesOnly } from "@/components/shell/for-judges";
import { formatCents } from "@/lib/say/money";
import type { PayQr } from "@/lib/say/types";

/**
 * Pay before the van leaves: the customer scans PayPal's own pay page off the tradesperson's
 * phone, or gets the link by text. The QR is PayPal's, from the Agent Toolkit's
 * generate_invoice_qr_code. Only when PayPal didn't give one is it drawn here, from PayPal's
 * recipient_view_url as read back from PayPal, and the screen says so.
 */
export function PayNow({ url, dueCents, customer, qr }: { url: string; dueCents: number; customer: string; qr?: PayQr }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fromPayPal = qr?.source === "paypal" ? qr.png : null;
  useEffect(() => {
    if (fromPayPal) return;
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#18181b", light: "#ffffff" } })
      .then((drawn) => live && setSvg(drawn))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [url, fromPayPal]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-4" data-testid="pay-now">
      <h3 className="text-base font-semibold text-zinc-950">Pay now: {formatCents(dueCents)}</h3>
      <p className="mt-0.5 text-sm text-zinc-600">Show this to {customer}. Their phone camera opens PayPal&apos;s page for this invoice, where they pay by card or PayPal.</p>
      <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="w-full max-w-[240px] shrink-0 space-y-1.5">
          <div className="rounded-lg bg-white p-2 ring-1 ring-zinc-200" data-testid="pay-qr" data-source={fromPayPal ? "paypal" : "local"} data-url={fromPayPal ? undefined : url} role="img" aria-label={fromPayPal ? "PayPal's QR code for this invoice" : "QR code for PayPal's page for this invoice"}>
            {fromPayPal ? (
              // eslint-disable-next-line @next/next/no-img-element -- PayPal's own PNG, as PayPal sent it
              <img src={`data:image/png;base64,${fromPayPal}`} alt="" className="h-auto w-full [image-rendering:pixelated]" />
            ) : svg ? (
              <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded bg-zinc-100" />
            )}
          </div>
          <p className="text-center text-xs text-zinc-500" data-testid="pay-qr-source">
            {fromPayPal ? (
              <>
                PayPal&apos;s own QR code
                <JudgesOnly>
                  , from <span className="font-mono">generate-qr-code</span>
                </JudgesOnly>
              </>
            ) : qr?.source === "local" ? (
              `PayPal's QR code didn't come back (${qr.why}), so this one is drawn here from PayPal's link.`
            ) : (
              "Drawn here from PayPal's link for this invoice."
            )}
          </p>
        </div>
        <div className="w-full min-w-0 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Or send the link</p>
          <p className="break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800" data-testid="pay-link">{url}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50" data-testid="copy-pay-link">
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50" data-testid="payer-link">
              Open what the customer sees <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
