import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * Running nothing, but the page reads a run's stored results, its projects and every set it was run with.
 *
 * Its own file rather than the one at the top of the signed-in app, which has
 * already been used by the time someone clicks through from a list.
 */
export default function Loading() {
  return <PageLoading label="Opening the scenario…" />;
}