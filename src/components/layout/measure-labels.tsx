"use client";

import { createContext, useContext } from "react";
import { GENERIC_MEASURE_LABELS, type MeasureLabels } from "@/lib/measure-labels";

const MeasureLabelsContext = createContext<MeasureLabels>(GENERIC_MEASURE_LABELS);

/** The network's size and length labels, for client components: loaded once
 * by the signed-in layout. A server component that knows its asset type asks
 * `getMeasureLabels` for that type's. */
export function MeasureLabelsProvider({ labels, children }: { labels: MeasureLabels; children: React.ReactNode }) {
  return <MeasureLabelsContext.Provider value={labels}>{children}</MeasureLabelsContext.Provider>;
}

export function useMeasureLabels(): MeasureLabels {
  return useContext(MeasureLabelsContext);
}
