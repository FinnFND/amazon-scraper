import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import { domainCodeFromUrl } from '@/lib/domain';
import type { ProductItem, SellerInput } from '@/types/apify';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';
import { BASE, IS_LOCAL } from '@/lib/env';


const APIFY_TOKEN = process.env.APIFY_TOKEN!;

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const raw = await req.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = raw; }
    logger.debug('POST /api/webhooks/actor1: webhook received. BODY22:', body);

    // Show exactly what's coming in
    try {
      const keys = body && typeof body === 'object' ? Object.keys(body) : [];
      logger.debug('POST /api/webhooks/actor1: body keys/types',
        keys.reduce((acc, k) => (acc[k] = typeof body[k], acc), {} as Record<string,string>)
      );
    } catch {}

    // Helper: get a key case-insensitively and trim strings
    const pick = (obj: any, candidates: string[]) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const c of candidates) {
        for (const k of Object.keys(obj)) {
          if (k.toLowerCase() === c.toLowerCase()) {
            const v = (obj as any)[k];
            return typeof v === 'string' ? v.trim() : v ?? null;
          }
        }
      }
      return null;
    };

    // Top-level (your custom payload)
    let jobId = pick(body, ['userJobId', 'user_job_id']);
    let datasetId = pick(body, ['datasetId', 'defaultDatasetId']);

    // Apify default shapes (resource/data)
    if (!datasetId) datasetId = pick(body?.resource, ['defaultDatasetId']) ?? pick(body?.data, ['defaultDatasetId']);

    // Optional: runId for traceability
    const runId = pick(body, ['runId']) ?? pick(body?.resource, ['id']) ?? pick(body?.data, ['id']);

    if (IS_LOCAL) {
      jobId = "bccRaKMvaauTrW0LZ";
      datasetId = "I3fBpzQilXhJMjCYB";
      logger.debug('IS_LOCAL detected, overriding jobId and datasetId', { jobId, datasetId });
    }

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

    const actor2WebhookPayloadTemplate = JSON.stringify({
      runId: '{{resource.id}}',
      datasetId: '{{resource.defaultDatasetId}}',
      userJobId: jobId, // pass your own id through
    });

    // Prepare the payload for the second actor run
    const actor2Payload = {
      input: sellerInput,
      webhooks: [{
        eventTypes: ['ACTOR.RUN.SUCCEEDED','ACTOR.RUN.ABORTED'],
        requestUrl: `${BASE}/api/webhooks/actor2`,
        payloadTemplate: actor2WebhookPayloadTemplate,
      }],
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