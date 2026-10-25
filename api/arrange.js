// Vercel function: Brick's layout step for free-form builds.
import { handleArrange } from '../server/plan.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { status, body } = await handleArrange(req.body ?? {});
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
