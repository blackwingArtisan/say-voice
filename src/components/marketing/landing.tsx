import { ArrowRight, Check, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { appConfig } from "@/app.config";
import { PhoneFold } from "./phone-fold";
import { ButtonLink } from "../ui/button";
import { AppLogo } from "../shell/app-logo";

/**
 * Landing page sections. Content comes from appConfig.landing; reorder or replace freely.
 *   <SiteHeader /> <Hero /> <Compare /> <RealJobs /> <PainPoints /> <HowItWorks /> <Features /> <CtaBand /> <SiteFooter />
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
      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-8 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-20 lg:pt-24">
        <div>
          <p className="max-w-xl text-lg leading-snug text-zinc-800" data-testid="hero-lead">
            <strong className="font-mono text-3xl font-semibold tabular-nums text-zinc-950 sm:text-4xl">{l.lead.figure}</strong> {l.lead.body}{" "}
            <a href={l.lead.source.href} target="_blank" rel="noreferrer" className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800" data-testid="hero-lead-source">
              {l.lead.source.label}
            </a>
          </p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm">
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
            <ShieldCheck className="size-4 shrink-0 translate-y-0.5 text-emerald-600" /> {l.whyNot}
          </p>
        </div>
        {/* On a phone the invoice folds to a row, under the buttons. */}
        <PhoneFold name="preview" title="See a real job's PayPal invoice" className="-mx-4 border-t border-zinc-200 sm:-mx-6 lg:mx-0 lg:border-0">
          <div className="px-4 pt-4 sm:px-6 lg:p-0">
            <RooferInvoice />
          </div>
        </PhoneFold>
      </div>
    </section>
  );
}

/** Why it matters: the researched pain points, each with its source. */
export function PainPoints() {
  return (
    <section id="why" className="py-20" data-testid="pain-points">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Why it matters</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">The person who does the job also chases the money</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {appConfig.landing.pains.map((p) => (
            <div key={p.title} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm" data-testid="pain-point">
              <p className="font-mono text-3xl font-semibold tabular-nums text-zinc-950">{p.figure}</p>
              <h3 className="mt-2 text-lg font-semibold text-zinc-900">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">{p.body}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-800">{p.answer}</p>
              <a href={p.source.href} target="_blank" rel="noreferrer" className="mt-auto pt-4 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800" data-testid="pain-source">
                {p.source.label}
              </a>
            </div>
          ))}
        </div>
        <div id="method" className="mt-10 scroll-mt-20 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-6" data-testid="method">
          <h3 className="text-lg font-semibold text-zinc-900">How &ldquo;6 of 20&rdquo; was counted</h3>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-zinc-600">{appConfig.landing.method}</p>
        </div>
      </div>
    </section>
  );
}

/** What the others don't do: three rows, each competitor cell linked to the page it comes from. */
export function Compare() {
  const c = appConfig.landing.compare;
  return (
    <section id="compare" className="py-20" data-testid="compare">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Housecall Pro and Jobber</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{c.title}</h2>
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full table-fixed border-collapse text-left text-[15px]">
            <thead className="hidden bg-zinc-50 text-sm text-zinc-600 md:table-header-group">
              <tr>
                <th className="w-1/4 px-5 py-3 font-medium" scope="col">
                  <span className="sr-only">What</span>
                </th>
                <th className="px-5 py-3 font-semibold text-zinc-900" scope="col">
                  {appConfig.name}
                </th>
                {c.products.map((p) => (
                  <th key={p.name} className="px-5 py-3 font-semibold text-zinc-900" scope="col">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.rows.map((row) => (
                <tr key={row.label} className="block border-t border-zinc-200 first:border-t-0 md:table-row" data-testid="compare-row">
                  <th scope="row" className="block px-5 pt-4 font-semibold text-zinc-900 md:table-cell md:py-4 md:align-top">
                    {row.label}
                  </th>
                  <td className="block px-5 pt-2 text-zinc-900 md:table-cell md:py-4 md:align-top" data-testid="compare-ours">
                    <span className="flex items-start gap-2">
                      <Check className="size-4 shrink-0 translate-y-1 text-emerald-600" />
                      <span>
                        <span className="font-medium md:hidden">{appConfig.name}: </span>
                        {row.ours}
                      </span>
                    </span>
                  </td>
                  {row.theirs.map((text, i) => (
                    <td key={c.products[i].name} className="block px-5 pt-2 text-zinc-600 last:pb-4 md:table-cell md:py-4 md:align-top" data-testid="compare-theirs">
                      <span className="font-medium text-zinc-800 md:hidden">{c.products[i].name}: </span>
                      {text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-zinc-600">
          {c.note} Sources:{" "}
          {c.products.map((p, i) => (
            <span key={p.name}>
              {i ? "; " : ""}
              <a href={p.source.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-zinc-900" data-testid="compare-source">
                {p.name}, {p.source.label}
              </a>
            </span>
          ))}
          .
        </p>
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
