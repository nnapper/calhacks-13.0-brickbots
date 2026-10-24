import { useState } from "react";
import { correctQuery, registerScrapedPart, updateScrapedPart } from "../lib/catalog.js";

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

// Searches goBILDA for parts missing from the catalog (/api/lookup) and adds the ones picked (/api/lookup/add).
// `onAdded` lets the caller re-render the catalog and gets the new part.
export function useLookup(onAdded) {
  const [state, setState] = useState({ query: null, busy: false, hits: [], error: "" });
  const [adding, setAdding] = useState(null); // sku being fetched

  const search = async (query) => {
    const corrected = correctQuery(query);
    setState({ query, corrected, busy: true, hits: [], error: "" });
    try {
      const { hits } = await post("/api/lookup", { query: corrected });
      setState({ query, corrected, busy: false, hits, error: "" });
    } catch (e) {
      setState({ query, corrected, busy: false, hits: [], error: e.message });
    }
  };

  const add = async (hit) => {
    setAdding(hit.sku);
    try {
      const { part } = await post("/api/lookup/add", { url: hit.url, sku: hit.sku });
      const added = registerScrapedPart(part);
      if (!added) throw new Error("that part has no price listed yet");
      setState((s) => ({ ...s, hits: s.hits.filter((h) => h.sku !== hit.sku), error: "" }));
      onAdded?.(added);
      // the saved photo and CAD-measured size land a few seconds later
      post("/api/lookup/finish", { sku: hit.sku }).then((j) => { updateScrapedPart(j.part); onAdded?.(added); }).catch(() => {});
    } catch (e) {
      setState((s) => ({ ...s, error: `Couldn't add ${hit.sku}: ${e.message}` }));
    }
    setAdding(null);
  };

  const clear = () => setState({ query: null, busy: false, hits: [], error: "" });

  return [state, { search, add, clear, adding }];
}
