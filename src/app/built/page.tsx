import type { Metadata } from "next";
import { BuiltFacts, RealJobs, SiteFooter, SiteHeader } from "@/components/marketing/landing";

export const metadata: Metadata = { title: "How it's built" };

/** What used to crowd the landing: the figures and their sources, both real jobs, and how "6 of 20" was counted. */
export default function BuiltPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <BuiltFacts />
        <RealJobs />
      </main>
      <SiteFooter />
    </>
  );
}
