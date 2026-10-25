// Vercel function: Brick's planner. The key comes from the CLAUDE_API_KEY (or ANTHROPIC_API_KEY) project variable.
import { handlePlan } from '../server/plan.js';
import prebuilt from '../public/generated/index.json' with { type: 'json' };

const skus = new Set(Object.keys(prebuilt));

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { status, body } = await handlePlan(req.body ?? {}, { prebuilt: skus });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
