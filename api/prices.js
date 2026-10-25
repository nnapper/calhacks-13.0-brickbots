// Vercel function: live seller prices through Apify. The key comes from the APIFY_API_KEY project variable. Results are kept
// in memory for a few minutes per instance; the catalog's saved prices are shown whenever the sellers can't be reached.
import { computeQuotes } from '../server/live-prices.js';
import parts from '../data/parts.json' with { type: 'json' };
import savedRates from '../data/rates.json' with { type: 'json' };

export const config = { maxDuration: 60 };

const cache = new Map();

// The exchange-rate service is tried first elsewhere; the saved rates keep this working if it is down.
async function rates() {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP,AUD,EUR,CAD,NZD', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = await res.json();
      return { date: j.date, base: 'USD', rates: { USD: 1, ...j.rates } };
    }
  } catch { /* use the saved rates */ }
  return savedRates;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { status, body } = await computeQuotes(req.body ?? {}, { parts, cache, budgetMs: 50_000, rates });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
