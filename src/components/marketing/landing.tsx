import { AlertTriangle, ArrowRight, Check, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { appConfig } from "@/app.config";
import { formatCents } from "@/lib/say/money";
import { PhoneFold } from "./phone-fold";
import { ButtonLink } from "../ui/button";
import { AppLogo } from "../shell/app-logo";

/**
 * Landing page sections. Content comes from appConfig.landing; reorder or replace freely.
 *   <SiteHeader /> <Hero /> <CatchProof /> <HowItWorks /> <RealJobs /> <SiteFooter />
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
    // Below lg the hero's boxes dissolve (contents) into the page's column, so on a phone Start a job and the
    // catch come first and the figures follow (see app/page.tsx). From lg it's the two-column hero.
    <section className="contents lg:relative lg:block lg:overflow-hidden">
      <div className="bg-grid absolute inset-0 hidden [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] lg:block" aria-hidden />
      <div className="absolute -top-40 left-1/2 hidden h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl lg:block" aria-hidden />
      <div className="contents lg:relative lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12 lg:px-6 lg:pb-20 lg:pt-24">
        <div className="contents lg:block">
          <div className="order-3 max-w-xl px-4 pt-8 sm:px-6 lg:order-none lg:px-0 lg:pt-0" data-testid="hero-lead">
            <p className="text-2xl font-semibold leading-snug tracking-tight text-zinc-950 sm:text-3xl">{l.lead.statement}</p>
            <p className="mt-2 text-lg leading-snug text-zinc-800">
              <strong className="font-mono text-2xl font-semibold tabular-nums text-zinc-950">{l.lead.figure}</strong> {l.lead.body}{" "}
              <a href={l.lead.source.href} target="_blank" rel="noreferrer" className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800" data-testid="hero-lead-source">
                {l.lead.source.label}
              </a>
            </p>
          </div>
          <div className="order-1 bg-gradient-to-b from-brand-50/70 to-transparent px-4 pb-8 pt-6 sm:px-6 lg:order-none lg:bg-none lg:p-0" data-testid="hero-top">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm lg:mt-6">
              <Sparkles className="size-4" /> {l.eyebrow}
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl lg:text-[56px]">{l.headline}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">{l.subheadline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={l.primaryCta.href} size="lg" data-testid="hero-start">
                {l.primaryCta.label} <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href={l.secondaryCta.href} size="lg" variant="secondary">
                {l.secondaryCta.label}
              </ButtonLink>
            </div>
          </div>
          <div className="order-3 px-4 pb-8 sm:px-6 lg:order-none lg:p-0" data-testid="hero-facts">
            {/* On a phone the proof figures wait: Real jobs below has the $600 and the method. */}
            <dl className="mt-8 hidden gap-3 sm:grid sm:grid-cols-2" data-testid="hero-proof">
              {l.proof.map((p) => (
                <div key={p.figure} className="rounded-xl border border-zinc-200 bg-white/80 p-4 shadow-sm">
                  <dt className="font-mono text-2xl font-semibold tabular-nums text-zinc-950">{p.figure}</dt>
                  <dd className="mt-1 text-sm leading-snug text-zinc-600">
                    {p.body}
                    {"href" in p && p.href ? (
                      <>
                        {" "}
                        <a href={p.href} className="font-medium text-brand-700 underline underline-offset-2" data-testid="proof-method-link">
                          How it was counted
                        </a>
                      </>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-zinc-700" data-testid="hero-why-not">
              <ShieldCheck className="size-4 shrink-0 translate-y-0.5 text-emerald-600" />
              <span>
                {l.whyNot.text}{" "}
                {l.whyNot.sources.map((src, i) => (
                  <span key={src.href}>
                    {i ? " · " : null}
                    <a href={src.href} target="_blank" rel="noreferrer" className="text-zinc-500 underline underline-offset-2 hover:text-zinc-800" data-testid="hero-why-not-source">
                      {src.label}
                    </a>
                  </span>
                ))}
              </span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600" data-testid="hero-who">
              Who it&apos;s for: <strong className="font-semibold text-zinc-800">{l.who.figure}</strong> {l.who.body}{" "}
              <a href={l.who.source.href} target="_blank" rel="noreferrer" className="text-zinc-500 underline underline-offset-2 hover:text-zinc-800" data-testid="hero-who-source">
                {l.who.source.label}
              </a>
            </p>
          </div>
        </div>
        {/* On a phone the invoice folds to a row, under the figures. */}
        <PhoneFold name="preview" title="See a real job's PayPal invoice" className="order-3 border-t border-zinc-200 lg:order-none lg:border-0">
          <div className="px-4 pt-4 sm:px-6 lg:p-0">
            <RooferInvoice />
          </div>
        </PhoneFold>
      </div>
    </section>
  );
}

/** The catch, as the sample job's confirm screen shows it: the words, the price heard, and the usual price from PayPal. */
export function CatchProof() {
  const c = appConfig.landing.catch;
  return (
    <section id="catch" className="order-2 scroll-mt-16 border-t border-zinc-200/70 bg-white py-10 lg:py-20" data-testid="catch-proof">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">The catch</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">{c.title}</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr] lg:gap-8">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5">
            <p className="text-sm font-medium text-zinc-500">What you said</p>
            <p className="mt-1 text-[17px] leading-relaxed text-zinc-800">&ldquo;{c.said}&rdquo;</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-amber-400 bg-amber-50/40 p-5" aria-label="The line as the confirm screen shows it">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium text-zinc-900">{c.item}</p>
              <p className="font-mono text-[15px] tabular-nums text-zinc-600">
                1 &times; {formatCents(c.heardCents)} <span className="ml-2 font-semibold text-zinc-950">{formatCents(c.heardCents)}</span>
              </p>
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900" data-testid="catch-proof-flag">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
              <span>
                Usually {formatCents(c.usualCents)}, from your PayPal invoices. This says {formatCents(c.heardCents)}. &ldquo;fifteen&rdquo; sounds like &ldquo;fifty&rdquo;.
              </span>
            </p>
            <div className="flex gap-2 text-sm font-medium" aria-hidden>
              <span className="flex-1 rounded-lg bg-brand px-3 py-2 text-center text-brand-foreground">Use {formatCents(c.usualCents)}</span>
              <span className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-zinc-800">Keep {formatCents(c.heardCents)}</span>
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">{c.note}</p>
      </div>
    </section>
  );
}

/** Real jobs: what the saved proof shows, nothing more. */
export function RealJobs() {
  const r = appConfig.landing.realJobs;
  return (
    <section id="real-jobs" className="border-y border-zinc-200/70 bg-zinc-50/60 py-20" data-testid="real-jobs">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Proof</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{r.title}</h2>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-zinc-600">{r.intro}</p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {r.jobs.map((j) => (
            <article key={j.trade} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="real-job">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold text-zinc-900">{j.trade}</h3>
                <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-950" data-testid="real-job-total">
                  {j.total}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {j.job} · {j.invoice}
              </p>
              <p className="mt-4 flex items-start gap-2 text-[15px] text-zinc-800" data-testid="real-job-lines">
                <Check className="size-4 shrink-0 translate-y-1 text-emerald-600" /> {j.lines}
              </p>
              <p className="mt-4 text-sm font-semibold text-zinc-900">Checked before it went out</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-zinc-600" data-testid="real-job-caught">
                {j.caught.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div id="method" className="mt-8 scroll-mt-20 rounded-2xl border border-zinc-200 bg-white p-6" data-testid="method">
          <h3 className="text-lg font-semibold text-zinc-900">How &ldquo;6 of 20&rdquo; was counted</h3>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-zinc-600">{appConfig.landing.method}</p>
        </div>
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
