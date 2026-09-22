import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * A report is assembled from the network as it stands, which takes a moment.
 *
 * Its own file rather than the one at the top of the signed-in app, which has
 * already been used by the time someone clicks through from a list.
 */
export default function Loading() {
  return <PageLoading label="Building the report…" />;
}