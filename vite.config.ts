import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import livePrices from './server/live-prices.js';
import lookupParts from './server/lookup.js';
import compatibilitySpecs from './server/compatibility.js';
import planner from './server/plan.js';
import elasticRecommendations from './server/elastic-recommendations.js';

export default defineConfig(({ mode }) => {
  // Server-side only. Don't use VITE_ prefixes for API keys.
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of [
    'APIFY_API_KEY', 'CONTEXT_DEV_API_KEY', 'CLAUDE_API_KEY', 'ANTHROPIC_API_KEY',
    'ELASTICSEARCH_URL', 'ELASTIC_API_KEY', 'ELASTIC_PARTS_INDEX',
    'ELASTIC_KIBANA_URL', 'ELASTIC_AGENT_ID',
    'ELASTIC_AGENT_TIMEOUT_MS', 'ELASTIC_SEARCH_TIMEOUT_MS',
    'ELASTIC_FAST_DISABLE_TOOLS', 'ELASTIC_RETRY_TIMEOUT_MS',
    'ELASTIC_ENABLE_FAST_RETRY',
  ]) {
    if (env[name]) process.env[name] ??= env[name];
  }

  return {
    plugins: [react(), livePrices(), lookupParts(), compatibilitySpecs(), planner(), elasticRecommendations()],
    build: { rollupOptions: { input: { catalog: 'index.html', workspace: 'workspace.html', legacyCatalog: 'catalog.html' } } },
    // Adding a part rewrites parts.json mid-session; refresh catalog data without reloading the page.
    server: {
      watch: { ignored: ['**/data/parts.json'] },
      proxy: { '/geometry': { target: 'http://127.0.0.1:8001', rewrite: (path) => path.replace(/^\/geometry/, '') } },
    },
    worker: { format: 'es' },
  };
});
