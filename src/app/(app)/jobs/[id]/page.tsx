import { Suspense } from "react";
import { JobScreen } from "@/components/say/job-screen";
import { SkeletonCard } from "@/components/ui";

/** Job ids are only known at request time, so useParams needs this Suspense boundary. */
export default function JobPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <JobScreen />
    </Suspense>
  );
}
