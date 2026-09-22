import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * Every option the run considered, year by year — tens of thousands of rows on a real network.
 *
 * Its own file rather than the one at the top of the signed-in app, which has
 * already been used by the time someone clicks through from a list.
 */
export default function Loading() {
  return <PageLoading label="Loading the alternatives…" />;
}