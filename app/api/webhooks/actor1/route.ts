import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import { domainCodeFromUrl } from '@/lib/domain';
import type { ProductItem, SellerInput } from '@/types/apify';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';
import { BASE } from '@/lib/env';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const raw = await req.text();
    type UnknownRecord = Record<string, unknown>;
    const parseJsonObject = (s: string): UnknownRecord => {
      try {
        const j = JSON.parse(s);
        if (j && typeof j === 'object' && !Array.isArray(j)) return j as UnknownRecord;
      } catch {}
      return {};
    };

    const body: UnknownRecord = parseJsonObject(raw);
    logger.debug('POST /api/webhooks/actor1: webhook received', body);

    const asObj = (v: unknown): UnknownRecord | undefined =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as UnknownRecord) : undefined;
    
    const getString = (obj: UnknownRecord | undefined, ...candidates: string[]): string | null => {
      if (!obj) return null;
      for (const cand of candidates) {
        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === cand.toLowerCase());
        if (!foundKey) continue;
        const v = obj[foundKey];
        if (typeof v === 'string') return v.trim();
      }
      return null;
    };

    // 1. Extract the runId and datasetId from the webhook payload
    const runId = getString(body, 'runId') ?? getString(asObj(body.resource), 'id');
    const datasetId = getString(body, 'datasetId') ?? getString(asObj(body.resource), 'defaultDatasetId');

    logger.debug('POST /api/webhooks/actor1: extracted values', { runId, datasetId });
    if (!runId || !datasetId) {
      logger.warn('Missing runId or datasetId in webhook payload');
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // 2. Use the runId to find our internal jobId
    const jobId = await kvGet<string>(`run:${runId}`);
    if (!jobId) {
      logger.error('Could not find jobId for runId', { runId });
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    logger.info('Found jobId mapping', { runId, jobId });

    const job = await kvGet<Job>(`job:${jobId}`);
    if (!job) {
      logger.error('Found jobId, but the job data is missing', { jobId, runId });
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    // The rest of the logic to fetch dataset items is correct and remains the same.
    const items: ProductItem[] = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
      const chunk = await res.json();
      const len = Array.isArray(chunk) ? chunk.length : 0;
      if (len > 0) items.push(...chunk);
      if (len < limit) break;
      offset += limit;
    }
    logger.debug('[actor1] Dataset fetch complete', { jobId, total: items.length });

    const seen = new Set<string>();
    const sellerInput: SellerInput[] = [];
    for (const it of items) {
      const sellerId = it?.sellerId || it?.seller?.id || null;
      if (!sellerId) continue;
      const dc = domainCodeFromUrl(it?.url ?? it?.sellerProfileUrl ?? undefined);
      const key = `${sellerId}::${dc}`;
      if (!seen.has(key)) { seen.add(key); sellerInput.push({ sellerId, domainCode: dc }); }
    }
    logger.debug('[actor1] Seller input prepared', { sellerCount: sellerInput.length });

    await kvSet(`job:${jobId}`, {
      ...job,
      updatedAt: Date.now(),
      status: 'RUNNING_SELLER',
      actor1DatasetId: datasetId,
      productCount: items.length,
      sellerInput
    });
    logger.info('POST /api/webhooks/actor1: job updated to RUNNING_SELLER', { jobId, productCount: items.length });

    // 3. Start actor 2, again without a dynamic webhook
    const actor2Payload = { input: sellerInput };
    const res2 = await fetch('https://api.apify.com/v2/acts/axesso_data~amazon-seller-scraper/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APIFY_TOKEN}` },
      body: JSON.stringify(actor2Payload)
    });

    logger.debug('POST /api/webhooks/actor1: queued actor2', { status: res2.status, ok: res2.ok });
    const data2 = await res2.json();
    const actor2RunId = data2?.data?.id ?? null;

    if (actor2RunId) {
        // 4. Create the mapping for the second actor's runId
        await kvSet(`run:${actor2RunId}`, jobId);
        logger.info('actor2 runId-to-jobId mapping created', { actor2RunId, jobId });
    }

    // 5. Update the main job object with the second actor's runId
    const latest = await kvGet<Job>(`job:${jobId}`);
    await kvSet(`job:${jobId}`, { ...(latest || {}), actor2RunId: actor2RunId });
    logger.info('POST /api/webhooks/actor1: saved actor2 runId; waiting for webhook at /api/webhooks/actor2', {
      jobId,
      actor2RunId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('POST /api/webhooks/actor1: unhandled error', { error: String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    logger.debug('POST /api/webhooks/actor1: finished', { durationMs: Date.now() - startedAt });
  }
}
