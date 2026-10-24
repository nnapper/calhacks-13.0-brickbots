import { useState } from "react";
import { applyLive } from "../lib/catalog.js";

// Asks the server (/api/prices) for fresh seller prices and updates the catalog in place.
// `onLive` lets the caller re-render anything that shows prices.
export function useLive(onLive) {
  const [status, setStatus] = useState({ busy: false, text: "" });

  const refresh = async (skus, { force = false } = {}) => {
    setStatus({ busy: true, text: "Checking sellers…" });
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus, force }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      for (const [sku, v] of Object.entries(j.prices)) applyLive(sku, v.offers);
      onLive?.();
      const n = Object.keys(j.prices).length;
      setStatus({
        busy: false,
        text: j.stale
          ? `Couldn't reach the sellers, showing last known prices${j.error ? ` (${j.error})` : ""}`
          : `Live prices updated for ${j.refreshed} ${j.refreshed === 1 ? "part" : "parts"}${j.cached ? `, ${j.cached} from the last few minutes` : ""}`,
      });
      return n;
    } catch (e) {
      setStatus({ busy: false, text: `Live prices unavailable: ${e.message}` });
      return 0;
    }
  };

  return [status, refresh];
}
