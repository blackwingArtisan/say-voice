"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui/cn";

/**
 * On a phone, a landing section folds to one row you can open, so the page is about two screens.
 * From lg up it's always open and the row isn't there. A link to an anchor inside it opens it.
 */
export function PhoneFold({ title, name, children, className }: { title: ReactNode; name: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const openFor = (hash: string) => {
      const id = decodeURIComponent(hash.slice(1));
      const target = id && body.current?.querySelector(`[id="${CSS.escape(id)}"]`);
      if (!target) return;
      setOpen(true);
      requestAnimationFrame(() => target.scrollIntoView());
    };
    const fromLocation = () => openFor(window.location.hash);
    // Next moves to a same-page anchor with pushState, which fires no hashchange, so a click on one counts too.
    const fromClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (link && link.pathname === window.location.pathname) openFor(link.hash);
    };
    const frame = requestAnimationFrame(fromLocation);
    window.addEventListener("hashchange", fromLocation);
    document.addEventListener("click", fromClick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", fromLocation);
      document.removeEventListener("click", fromClick);
    };
  }, []);
  return (
    <div className={className} data-testid={`fold-${name}`} data-open={open || undefined}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4 text-left text-[15px] font-semibold text-zinc-900 lg:hidden" data-testid={`fold-${name}-toggle`}>
        {title}
        <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      <div ref={body} className={open ? undefined : "hidden lg:block"}>
        {children}
      </div>
    </div>
  );
}
