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
    const body = await req.json();
    logger.debug('POST /api/webhooks/actor1: webhook received. BODY:', body);
    // destructure from body.data
    const jobId = body.data?.id;
    const datasetId = body.data?.defaultDatasetId;
    logger.debug('POST /api/webhooks/actor1: extracted values', { jobId, datasetId });
    if (!jobId || !datasetId) {
      logger.warn('Missing jobId or datasetId in webhook payload', body.data);
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const job = await kvGet<Job>(`job:${jobId}`);
    if (!job) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const items: ProductItem[] = [];
    let offset = 0;
    const limit = 1000;

    logger.debug('[actor1] Starting dataset fetch', { jobId, datasetId, offset, limit });

    while (true) {
      const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
      logger.debug('[actor1] Fetching dataset chunk', { jobId, datasetId, offset, limit, url });
      const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
      logger.debug('[actor1] Fetch response', { status: res.status, ok: res.ok });
      const chunk = await res.json();


      const len = Array.isArray(chunk) ? chunk.length : 0;
      logger.debug('[actor1] Received chunk', { offset, len });
      items.push(...chunk);
      logger.debug('[actor1] Items accumulated', { total: items.length });
      if (len < limit) { logger.debug('[actor1] Reached last chunk', { len, limit }); break; }
      offset += limit;
      logger.debug('[actor1] Next offset set', { offset });
    }

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

    // Prepare the payload for the second actor run
    const actor2Payload = {
      input: sellerInput,
      webhooks: [{
        eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.ABORTED'],
        requestUrl: `${BASE}/api/webhooks/actor2`,
        payloadTemplate: JSON.stringify({ runId: '{{runId}}', datasetId: '{{defaultDatasetId}}', userJobId: jobId })
      }]
    };

    const res2 = await fetch('https://api.apify.com/v2/acts/axesso_data~amazon-seller-scraper/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APIFY_TOKEN}` },
      body: JSON.stringify(actor2Payload)
    });
    logger.debug('POST /api/webhooks/actor1: queued actor2', { status: res2.status, ok: res2.ok });
    const data2 = await res2.json();
    const latest = await kvGet<Job>(`job:${jobId}`);
    await kvSet(`job:${jobId}`, { ...(latest || {}), actor2RunId: data2?.data?.id ?? null });
    logger.info('POST /api/webhooks/actor1: saved actor2 runId; waiting for webhook at /api/webhooks/actor2', {
      jobId,
      actor2RunId: data2?.data?.id ?? null,
      webhookUrl: `${BASE}/api/webhooks/actor2`
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('POST /api/webhooks/actor1: unhandled error', { error: String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    logger.debug('POST /api/webhooks/actor1: finished', { durationMs: Date.now() - startedAt });
  }
}