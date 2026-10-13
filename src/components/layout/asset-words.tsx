"use client";

import { createContext, useContext } from "react";
import { assetWords, DEFAULT_BRANDING, type AssetWords } from "@/lib/branding";

const AssetWordsContext = createContext<AssetWords>(assetWords(DEFAULT_BRANDING));

/** The organization's asset words, for client components: loaded once by the
 * signed-in layout so a form or grid need not be handed them. */
export function AssetWordsProvider({ words, children }: { words: AssetWords; children: React.ReactNode }) {
  return <AssetWordsContext.Provider value={words}>{children}</AssetWordsContext.Provider>;
}

export function useAssetWords(): AssetWords {
  return useContext(AssetWordsContext);
}
