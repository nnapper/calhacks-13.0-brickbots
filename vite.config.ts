import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import livePrices from './server/live-prices.js';
import lookupParts from './server/lookup.js';

export default defineConfig(({mode}) => {
  // Server-side middleware reads these values from .env without exposing them to the bundle.
  const env = loadEnv(mode, process.cwd(), '');
  if (env.APIFY_API_KEY) process.env.APIFY_API_KEY ??= env.APIFY_API_KEY;
  if (env.CONTEXT_DEV_API_KEY) process.env.CONTEXT_DEV_API_KEY ??= env.CONTEXT_DEV_API_KEY;

  return {
    plugins: [react(), livePrices(), lookupParts()],
    build: {rollupOptions: {input: {workspace: 'index.html', catalog: 'catalog.html'}}},
    // Adding a part rewrites parts.json mid-session; refresh catalog data without reloading the page.
    server: {
      watch: {ignored: ['**/data/parts.json']},
      proxy: {'/geometry': {target: 'http://127.0.0.1:8001', rewrite: path => path.replace(/^\/geometry/, '')}},
    },
    worker: {format: 'es'},
  };
});
