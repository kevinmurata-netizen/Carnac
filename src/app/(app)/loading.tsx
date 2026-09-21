import { PageLoading } from "@/components/ui/loading-indicator";

/**
 * What every page shows while its data loads.
 *
 * One file for the whole signed-in app: it sits inside the shared layout, so
 * the sidebar and header stay put and only the page area changes. Many pages
 * here walk the whole network before they can render — a work plan, a
 * scenario, the alternatives table — and without this a click on one of them
 * looked like nothing had happened for several seconds.
 */
export default function Loading() {
  return <PageLoading />;
}
