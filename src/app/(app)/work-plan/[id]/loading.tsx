import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * Opening a plan reads every row, its segments and its scenario, which takes
 * a few seconds on a real programme.
 *
 * Its own file rather than relying on the one at the top of the signed-in app:
 * that boundary has already been used by the time someone is looking at the
 * list of plans, so clicking one showed nothing at all until the page arrived.
 * A loading state belongs in the folder whose page is being waited for.
 */
export default function Loading() {
  return <PageLoading label="Opening the plan…" />;
}
