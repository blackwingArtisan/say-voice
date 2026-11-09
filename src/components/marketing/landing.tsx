import { AlertTriangle, ArrowRight, Check, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { appConfig } from "@/app.config";
import { formatCents } from "@/lib/say/money";
import { PhoneFold } from "./phone-fold";
import Link from "next/link";
import { ButtonLink } from "../ui/button";
import { AppLogo } from "../shell/app-logo";

/**
 * Landing page sections. Content comes from appConfig.landing.
 *   Landing: <SiteHeader /> <Hero /> (with <CatchProof />) <HowItWorks /> <ProofCard /> <SiteFooter />
 *   /built:  <SiteHeader /> <BuiltFacts /> <RealJobs /> <SiteFooter />
 */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <AppLogo />
        <nav className="flex items-center gap-2">
          <Link href="/#how" className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 sm:block">
            How it works
          </Link>
          <Link href="/built" className="hidden rounded-md px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 sm:block">
            How it&apos;s built
          </Link>
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

/**
 * The hero: what it is, the problem in one line, Start a job, and the live catch beside it. The figures,
 * the comparison and the method are on /built, a tap away.
 */
export function Hero() {
  const l = appConfig.landing;
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 hidden [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] lg:block" aria-hidden />
      <div className="absolute -top-40 left-1/2 hidden h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl lg:block" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-6 px-4 pb-8 pt-5 sm:gap-8 sm:px-6 sm:pb-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-12 lg:pb-16 lg:pt-16">
        <div className="bg-gradient-to-b from-brand-50/70 to-transparent lg:bg-none" data-testid="hero-top">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm">
            <Sparkles className="size-4 shrink-0" /> {l.eyebrow}
          </span>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl lg:text-[52px]">{l.headline}</h1>
          <p className="mt-4 text-xl font-semibold leading-snug tracking-tight text-zinc-900" data-testid="hero-lead">
            {l.lead.statement}
          </p>
          {/* On a phone the catch beside it says the same thing, so the page stays short. */}
          <p className="mt-3 hidden max-w-xl text-lg leading-relaxed text-zinc-600 sm:block">{l.subheadline}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href={l.primaryCta.href} size="lg" data-testid="hero-start">
              {l.primaryCta.label} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href={l.secondaryCta.href} size="lg" variant="secondary">
              {l.secondaryCta.label}
            </ButtonLink>
          </div>
        </div>
        <CatchProof />
      </div>
    </section>
  );
}

/**
 * The catch, as the sample job's confirm screen shows it, with one tap into the real thing: the sample job
 * against the trade's PayPal invoices, or the same job on day one, with no history at all.
 */
export function CatchProof() {
  const c = appConfig.landing.catch;
  return (
    <section id="catch" className="scroll-mt-20 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl shadow-brand-900/5 ring-1 ring-black/5 sm:p-6" data-testid="catch-proof">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">The catch</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">{c.title}</h2>
      <p className="mt-3 text-sm font-medium text-zinc-500">What you said</p>
      <p className="mt-0.5 text-[16px] leading-relaxed text-zinc-800">&ldquo;{c.said}&rdquo;</p>
      <div className="mt-4 space-y-3 rounded-xl border border-amber-400 bg-amber-50/40 p-4" aria-label="The line as the confirm screen shows it">
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
      <p className="mt-3 hidden text-sm leading-relaxed text-zinc-600 sm:block" data-testid="catch-note">{c.note}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ButtonLink href="/jobs?try=sample" variant="dark" size="lg" data-testid="catch-try">
          Try this job <ArrowRight className="size-4" />
        </ButtonLink>
        <ButtonLink href="/jobs?try=day-one" variant="secondary" size="lg" data-testid="catch-try-day-one">
          Day one: no PayPal history
        </ButtonLink>
      </div>
    </section>
  );
}

/** The one proof on the landing: the roofer's real job, as the customer's PayPal page shows it. */
export function ProofCard() {
  const roofer = appConfig.landing.realJobs.jobs[0];
  return (
    <section className="border-t border-zinc-200/70 bg-zinc-50/60 py-8 sm:py-10 lg:py-16" data-testid="proof-card">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">A real job</p>
          <div className="mt-2 flex items-baseline justify-between gap-3 lg:justify-start">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">{roofer.trade}: {roofer.job.toLowerCase()}</h2>
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-950" data-testid="proof-card-total">{roofer.total}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{roofer.invoice}</p>
          <p className="mt-4 flex items-start gap-2 text-[15px] text-zinc-800">
            <Check className="size-4 shrink-0 translate-y-1 text-emerald-600" /> {roofer.lines}
          </p>
          <p className="mt-3 hidden text-[15px] leading-relaxed text-zinc-600 sm:block">{roofer.caught[0]}</p>
          <Link href="/built" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700 underline-offset-2 hover:underline" data-testid="built-link">
            How it&apos;s built: the second job, the test method and the sources <ArrowRight className="size-4 shrink-0" />
          </Link>
        </div>
        {/* On a phone the invoice folds to a row. */}
        <PhoneFold name="preview" title="See this job's PayPal invoice" className="border-t border-zinc-200 lg:border-0">
          <div className="pt-4 lg:pt-0">
            <RooferInvoice />
          </div>
        </PhoneFold>
      </div>
    </section>
  );
}

/** The figures behind the product, with their sources. On /built, not the landing. */
export function BuiltFacts() {
  const l = appConfig.landing;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 lg:pt-16" data-testid="hero-facts">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it&apos;s built</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Why it exists, and what it was tested on</h1>
      <div className="mt-6 max-w-3xl" data-testid="built-lead">
        <p className="text-lg leading-snug text-zinc-800">
          {l.lead.statement} <strong className="font-mono text-2xl font-semibold tabular-nums text-zinc-950">{l.lead.figure}</strong> {l.lead.body}{" "}
          <a href={l.lead.source.href} target="_blank" rel="noreferrer" className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800" data-testid="hero-lead-source">
            {l.lead.source.label}
          </a>
        </p>
      </div>
      <dl className="mt-8 grid gap-3 sm:grid-cols-2" data-testid="hero-proof">
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
      <p className="mt-6 flex max-w-3xl items-start gap-2 text-sm leading-relaxed text-zinc-700" data-testid="hero-why-not">
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
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600" data-testid="hero-who">
        Who it&apos;s for: <strong className="font-semibold text-zinc-800">{l.who.figure}</strong> {l.who.body}{" "}
        <a href={l.who.source.href} target="_blank" rel="noreferrer" className="text-zinc-500 underline underline-offset-2 hover:text-zinc-800" data-testid="hero-who-source">
          {l.who.source.label}
        </a>
      </p>
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
    <section id="how" className="scroll-mt-16 border-t border-zinc-200/70 bg-white py-8 sm:py-10 lg:py-16" data-testid="how">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">Three steps, done before you drive off</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3 md:gap-6 lg:mt-8">
          {appConfig.landing.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 md:block md:rounded-2xl md:border md:border-zinc-200 md:bg-zinc-50/50 md:p-6" data-testid="how-step">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground md:size-9">{i + 1}</span>
              <div>
                <h3 className="text-base font-semibold text-zinc-900 md:mt-4 md:text-lg">{s.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-zinc-600 md:mt-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
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
