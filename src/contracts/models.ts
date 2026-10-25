import { z } from 'zod';

export const unitsSchema = z.enum(['meter', 'millimeter', 'centimeter', 'inch', 'foot']);
const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const productSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().min(1), retailer: z.string(), sku: z.string().nullable(),
  name: z.string().min(1), category: z.string(), sourceUrl: z.url(),
  images: z.array(z.object({ url: z.url(), localUrl: z.string().optional(), kind: z.enum(['photo', 'drawing', 'unknown']) })),
  cadSources: z.array(z.object({ url: z.url(), format: z.enum(['step', 'stp', 'glb']), sourceUrl: z.url() })),
  dimensions: z.array(z.object({ value: z.number().positive(), unit: unitsSchema, meaning: z.string(), sourceUrl: z.url(), verification: z.enum(['unverified', 'source_confirmed']) })),
  retrievedAt: z.string().optional(), actorRunId: z.string().optional(),
});
export type Product = z.infer<typeof productSchema>;
export const modelAssetSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), productId: z.string().optional(), revision: z.number().int().positive(),
  name: z.string(), originalFormat: z.enum(['step', 'stp', 'stl', 'glb']), originalFileId: z.string().optional(), previewFileId: z.string().optional(),
  sourceKind: z.enum(['uploaded_cad', 'manufacturer_cad', 'generated_image', 'test_fixture']),
  sourceUnits: unitsSchema.nullable(), canonicalUnits: z.literal('meter'),
  sourceToCanonicalTransform: z.array(z.number().finite()).length(16).nullable(),
  conversion: z.object({ engine: z.string(), outputUnits: z.literal('meter'), linearDeflectionM: z.number().positive().optional() }),
  bounds: z.object({ min: vec3, max: vec3 }),
  scaleStatus: z.enum(['format_defined', 'user_confirmed', 'unknown']),
  sourceImage: z.string().optional(), providerTaskId: z.string().optional(),
});
export type ModelAsset = z.infer<typeof modelAssetSchema>;
export const generationJobSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), productId: z.string(), inputHash: z.string(),
  provider: z.string(), settings: z.record(z.string(), z.unknown()),
  status: z.enum(['queued', 'processing', 'succeeded', 'failed']),
  providerTaskId: z.string().optional(), assetId: z.string().optional(), error: z.string().optional(),
}).superRefine((job, ctx) => {
  if (job.status === 'succeeded' && !job.assetId) ctx.addIssue({ code: 'custom', message: 'Successful jobs require an assetId' });
  if (job.status === 'failed' && !job.error) ctx.addIssue({ code: 'custom', message: 'Failed jobs require an error' });
});
export type GenerationJob = z.infer<typeof generationJobSchema>;

// Proposed teammate handoff. Validate at the boundary; no scraper changes required.
const discoverySchema = z.object({
  retailer: z.string(), sku: z.string().nullish(), name: z.string(), category: z.string(), url: z.url(),
  images: z.array(z.object({ url: z.url(), local: z.string().optional(), kind: z.enum(['photo', 'drawing', 'unknown']).optional() })),
  dimensions_mm: z.record(z.string(), z.number().nullable()).nullish(),
  cadSources: productSchema.shape.cadSources.optional(), scraped_at: z.string().optional(), actorRunId: z.string().optional(),
});
export function normalizeDiscovery(input: unknown): Product {
  // Generic catalog products are shared across retailers; the offer supplies provenance.
  const generic = z.object({generic:z.literal(true),sku:z.string(),name:z.string(),category:z.string(),offers:z.array(z.object({url:z.url()})).min(1)}).safeParse(input);
  const source = generic.success ? {...generic.data,retailer:'generic',url:generic.data.offers[0].url,images:[]} : input;
  const p = discoverySchema.parse(source);
  const canonicalUrl = new URL(p.url); canonicalUrl.hash = ''; canonicalUrl.search = '';
  const id = p.sku ? `${p.retailer.toLowerCase()}:${p.sku}` : canonicalUrl.href.replace(/\/$/, '');
  return productSchema.parse({ schemaVersion: 1, id, retailer: p.retailer, sku: p.sku ?? null, name: p.name, category: p.category,
    sourceUrl: p.url, images: p.images.map(i => ({ url: i.url, localUrl: i.local, kind: i.kind ?? 'unknown' })),
    cadSources: p.cadSources ?? [], dimensions: Object.entries(p.dimensions_mm ?? {}).filter(([, v]) => v != null && v > 0).map(([meaning, value]) => ({ value, unit: 'millimeter', meaning, sourceUrl: p.url, verification: 'unverified' })),
    retrievedAt: p.scraped_at, actorRunId: p.actorRunId,
  });
}
