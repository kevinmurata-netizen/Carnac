"use client";

import { createContext, useContext } from "react";
import { GENERIC_INDEX_WORDS, type IndexWords } from "@/lib/index-words";

const IndexWordsContext = createContext<IndexWords>(GENERIC_INDEX_WORDS);

/** The network's condition index words, for client components: loaded once
 * by the signed-in layout so a form or grid need not be handed them. A server
 * component that knows its asset type asks `getIndexWords` for that type's. */
export function IndexWordsProvider({ words, children }: { words: IndexWords; children: React.ReactNode }) {
  return <IndexWordsContext.Provider value={words}>{children}</IndexWordsContext.Provider>;
}

export function useIndexWords(): IndexWords {
  return useContext(IndexWordsContext);
}
