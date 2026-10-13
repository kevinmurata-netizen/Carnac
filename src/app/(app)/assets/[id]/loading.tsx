"use client";

import { PageLoading } from "@/components/ui/loading-indicator";
import { useAssetWords } from "@/components/layout/asset-words";

/**
 * An asset's page gathers its attributes, condition history, failures, risk and planned work.
 *
 * Its own file rather than the one at the top of the signed-in app, which has
 * already been used by the time someone clicks through from a list.
 */
export default function Loading() {
  const words = useAssetWords();
  return <PageLoading label={`Opening the ${words.item}…`} />;
}