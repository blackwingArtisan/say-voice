import { Compare, CtaBand, Features, Hero, HowItWorks, PainPoints, SiteFooter, SiteHeader } from "@/components/marketing/landing";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Compare />
        <PainPoints />
        <HowItWorks />
        <Features />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
