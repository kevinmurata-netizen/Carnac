import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * A set's page reads every scenario in it and the results of each.
 *
 * Its own file rather than the one at the top of the signed-in app, which has
 * already been used by the time someone clicks through from a list.
 */
export default function Loading() {
  return <PageLoading label="Opening the set…" />;
}