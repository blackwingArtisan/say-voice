import { Compare, CtaBand, Features, Hero, HowItWorks, PainPoints, RealJobs, SiteFooter, SiteHeader } from "@/components/marketing/landing";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Compare />
        <RealJobs />
        <PainPoints />
        <HowItWorks />
        <Features />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
