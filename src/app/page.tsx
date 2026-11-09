import { Hero, HowItWorks, ProofCard, SiteFooter, SiteHeader } from "@/components/marketing/landing";

/**
 * Product first: the hero with the live catch beside it, three steps, and one real job. The figures, the
 * comparison, the second job and the method are on /built ("How it's built").
 */
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <ProofCard />
      </main>
      <SiteFooter />
    </>
  );
}
