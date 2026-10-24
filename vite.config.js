import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import livePrices from "./server/live-prices.js";

export default defineConfig(({ mode }) => {
  // Server-side only: lets the /api/prices middleware read APIFY_API_KEY from .env.
  // It is deliberately not passed to `define`, so it never reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), "");
  if (env.APIFY_API_KEY) process.env.APIFY_API_KEY ??= env.APIFY_API_KEY;

  return { plugins: [react(), livePrices()] };
});
