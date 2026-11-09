"use client";

import { ChevronDown } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { JUDGES_COOKIE } from "@/lib/say/visitor";
import { cn } from "../ui/cn";
import { ModeBadges } from "./mode-badges";

/**
 * One switch for everything a judge may want and a tradesperson doesn't: which PayPal, which models, the AI spend,
 * the PayPal endpoints behind each screen, the record's integrity badge. The trade's own screens show none of it
 * until it is opened. It is the say-judges cookie, so it stays open across pages until closed, and it is what lets
 * /api/audit and /api/paypal/ledger show the whole record.
 */
const CHANGED = "say-judges-changed";
const isOpen = () => new RegExp(`(?:^|;\\s*)${JUDGES_COOKIE}=1(?:;|$)`).test(document.cookie);
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
function setOpen(open: boolean) {
  document.cookie = `${JUDGES_COOKIE}=${open ? "1" : ""}; path=/; max-age=${open ? 86400 : 0}; samesite=lax`;
  window.dispatchEvent(new Event(CHANGED));
}

/** Whether For judges is open. Closed on the server and on first paint. */
export const useJudges = () => useSyncExternalStore(subscribe, isOpen, () => false);

/** Shows its children only while For judges is open. */
export function JudgesOnly({ children }: { children: ReactNode }) {
  return useJudges() ? <>{children}</> : null;
}

export function ForJudges({ className, vertical }: { className?: string; vertical?: boolean }) {
  const open = useJudges();
  const toggle = () => setOpen(!open);
  return (
    <div className={cn("text-xs", className)} data-testid="for-judges" data-open={open || undefined}>
      <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex min-h-8 items-center gap-1 font-medium text-zinc-400 hover:text-zinc-700" data-testid="for-judges-toggle">
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        For judges
      </button>
      {open ? (
        <div className="mt-2 space-y-3">
          <ModeBadges vertical={vertical} />
          <p className="text-[11px] leading-relaxed text-zinc-500">Sandbox only. No live PayPal calls are possible from this app. With this open, each screen shows the PayPal calls behind it; each job&apos;s Details, and Activity, show them with their debug ids. <a href="/api/paypal/ledger" className="underline">/api/paypal/ledger</a> and <a href="/api/audit" className="underline">/api/audit</a> show the whole record, real addresses hidden; otherwise only this browser&apos;s jobs. The figures on late payment are on <a href="/built" className="underline">/built</a>.</p>
        </div>
      ) : null}
    </div>
  );
}
