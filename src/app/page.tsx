import { CatchProof, Hero, HowItWorks, RealJobs, SiteFooter, SiteHeader } from "@/components/marketing/landing";
import { PhoneFold } from "@/components/marketing/phone-fold";

/** Billing accuracy first: the hero, the catch as proof, three steps, and real jobs. */
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <CatchProof />
        {/* On a phone each of these is one row to open, so the page stays short. */}
        <PhoneFold name="how" title="How it works">
          <HowItWorks />
        </PhoneFold>
        <PhoneFold name="real-jobs" title="Real jobs, sent through PayPal">
          <RealJobs />
        </PhoneFold>
      </main>
      <SiteFooter />
    </>
  );
}
