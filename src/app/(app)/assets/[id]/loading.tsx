import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * A segment's page gathers its attributes, condition history, failures, risk and planned work.
 *
 * Its own file rather than the one at the top of the signed-in app, which has
 * already been used by the time someone clicks through from a list.
 */
export default function Loading() {
  return <PageLoading label="Opening the segment…" />;
}