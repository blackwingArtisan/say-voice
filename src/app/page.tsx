import { CatchProof, Hero, HowItWorks, RealJobs, SiteFooter, SiteHeader } from "@/components/marketing/landing";
import { PhoneFold } from "@/components/marketing/phone-fold";

/**
 * Billing accuracy first: the hero, the catch as proof, three steps, and real jobs. On a phone the page is
 * one column in this order: the headline with Start a job, the catch, then the figures and their sources.
 */
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-col lg:block">
        <Hero />
        <CatchProof />
        {/* On a phone each of these is one row to open, so the page stays short. */}
        <PhoneFold name="how" title="How it works" className="order-4 lg:order-none">
          <HowItWorks />
        </PhoneFold>
        <PhoneFold name="real-jobs" title="Real jobs, sent through PayPal" className="order-4 lg:order-none">
          <RealJobs />
        </PhoneFold>
      </main>
      <SiteFooter />
    </>
  );
}
