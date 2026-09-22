import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * An inspection's page gathers its results, attachments and the condition it produced.
 *
 * Its own file rather than the one at the top of the signed-in app, which has
 * already been used by the time someone clicks through from a list.
 */
export default function Loading() {
  return <PageLoading label="Opening the inspection…" />;
}