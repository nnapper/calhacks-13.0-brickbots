// Vercel function: the Elastic compatibility agent. It reuses the dev server's handler by giving it a request that carries
// the already-parsed JSON body. Needs ELASTICSEARCH_URL, ELASTIC_API_KEY and ELASTIC_KIBANA_URL (and optionally
// ELASTIC_PARTS_INDEX and ELASTIC_AGENT_ID) as project variables.
import { Readable } from 'node:stream';
import { elasticApiHandler } from '../../server/elastic-recommendations.js';

export const config = { maxDuration: 60 };

const handle = elasticApiHandler();

export default async function handler(req, res) {
  const request = Object.assign(Readable.from([Buffer.from(JSON.stringify(req.body ?? {}))]), {
    method: req.method, url: '/api/elastic/evaluate', headers: { 'content-type': 'application/json' },
  });
  await handle(request, res, () => res.status(404).json({ error: 'Unknown Elastic endpoint' }));
}
