import { ArrowRight, Check, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { appConfig } from "@/app.config";
import { ButtonLink } from "../ui/button";
import { AppLogo } from "../shell/app-logo";

/**
 * Landing page sections. Content comes from appConfig.landing; reorder or replace freely.
 *   <SiteHeader /> <Hero /> <HowItWorks /> <Features /> <CtaBand /> <SiteFooter />
 */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <AppLogo />
        <nav className="flex items-center gap-2">
          <a href="#how" className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 sm:block">
            How it works
          </a>
          <ButtonLink href={appConfig.landing.primaryCta.href} size="sm">
            {appConfig.landing.primaryCta.label}
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

/** The real roofer's job, re-sent through PayPal's sandbox under the trade's name, as the customer's page shows it. */
function RooferInvoice() {
  return (
    <figure className="relative" data-testid="hero-preview">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-brand-900/10 ring-1 ring-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed screenshot, no resizing wanted */}
        <img src="/proof/roofer-invoice.png" alt="The roofer's $600 PayPal invoice: Labor $400 and Material $200, each with what was done" width={900} height={1000} className="h-auto w-full" />
      </div>
      <figcaption className="mt-3 flex items-start gap-2 text-sm text-zinc-600">
        <Mic className="size-4 shrink-0 translate-y-0.5 text-brand" />
        <span>A working roofer said this job out loud: their words and numbers, on the PayPal page a customer opens, under the trade&apos;s name. What was fixed is on every line. (Customer and trade name are illustrative.)</span>
      </figcaption>
    </figure>
  );
}

export function Hero() {
  const l = appConfig.landing;
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
      <div className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm">
            <Sparkles className="size-4" /> {l.eyebrow}
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl lg:text-[56px]">{l.headline}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">{l.subheadline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={l.primaryCta.href} size="lg">
              {l.primaryCta.label} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href={l.secondaryCta.href} size="lg" variant="secondary">
              {l.secondaryCta.label}
            </ButtonLink>
          </div>
          <dl className="mt-8 grid gap-3 sm:grid-cols-2" data-testid="hero-proof">
            {l.proof.map((p) => (
              <div key={p.figure} className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm">
                <dt className="font-mono text-2xl font-semibold tabular-nums text-zinc-950">{p.figure}</dt>
                <dd className="mt-1 text-sm leading-snug text-zinc-600">{p.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-zinc-700" data-testid="hero-why-not">
            <ShieldCheck className="size-4 shrink-0 translate-y-0.5 text-emerald-600" /> {l.whyNot}
          </p>
        </div>
        <RooferInvoice />
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-zinc-200/70 bg-white py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Three steps, done before you drive off</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {appConfig.landing.steps.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">{i + 1}</span>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section className="py-20">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-3">
        {appConfig.landing.features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <Check className="size-5 text-brand" />
            <h3 className="mt-3 font-semibold text-zinc-900">{f.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-600">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-8 py-12 text-white shadow-xl md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{appConfig.tagline}</h2>
          <p className="mt-2 text-white/75">No mic handy? Try a sample job and watch it become a real sandbox invoice.</p>
        </div>
        <ButtonLink href={appConfig.landing.primaryCta.href} size="lg" variant="secondary" className="border-transparent">
          {appConfig.landing.primaryCta.label} <ArrowRight className="size-4" />
        </ButtonLink>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>
          {appConfig.name} · PayPal sandbox only · MIT licensed
        </span>
        <span>Built with PayPal, Claude, ElevenLabs and Claude Code</span>
      </div>
    </footer>
  );
}
