import { Compare, CtaBand, Features, Hero, HowItWorks, PainPoints, RealJobs, SiteFooter, SiteHeader } from "@/components/marketing/landing";
import { PhoneFold } from "@/components/marketing/phone-fold";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        {/* On a phone each of these is one row to open, so the page is about two screens. */}
        <PhoneFold name="compare" title="What the others don't do">
          <Compare />
        </PhoneFold>
        <PhoneFold name="real-jobs" title="Real jobs, sent through PayPal">
          <RealJobs />
        </PhoneFold>
        <PhoneFold name="why" title="Why it matters, with sources">
          <PainPoints />
        </PhoneFold>
        <PhoneFold name="how" title="How it works">
          <HowItWorks />
        </PhoneFold>
        <PhoneFold name="features" title="What it does">
          <Features />
        </PhoneFold>
        <div className="hidden lg:block">
          <CtaBand />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
