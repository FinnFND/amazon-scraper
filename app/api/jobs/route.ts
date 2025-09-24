// app/api/jobs/route.ts
import { NextResponse } from 'next/server';
import { kvSet } from '@/lib/redis';
import { nanoid } from 'nanoid';
import logger from '@/lib/logger';

// IMPORTANT: this must be the raw JS string for Apify, not a function object.
import extendOutputFunction from '@/lib/extendOutputFunction'; // should export a STRING

const APIFY_TOKEN = process.env.APIFY_TOKEN!;
const BASE = process.env.PUBLIC_BASE_URL!;

type Body = { keywords: string[]; marketplaces?: Array<'com'|'co.uk'>; endPage?: number };

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as Body;
    const keywords = (body.keywords || []).map(s => s.trim()).filter(Boolean);
    const marketplaces = (body.marketplaces?.length ? body.marketplaces : ['com','co.uk']) as Array<'com'|'co.uk'>;
    const endPage = body.endPage ?? 7;

    if (!keywords.length) {
      return NextResponse.json({ error: 'keywords required' }, { status: 400 });
    }

    const id = nanoid();
    await kvSet(`job:${id}`, {
      id, createdAt: Date.now(), updatedAt: Date.now(),
      status: 'RUNNING_PRODUCT',
      keywords, marketplaces, endPage
    });

    // Build Actor 1 input
    const input = {
      search: keywords.join(' '),
      endPage,
      customMapFunction: '(object) => { return {...object} }',
      // ⬇️ must be a string; confirm your import is a string
      extendOutputFunction,
      maxItems: 1,
      proxy: { 
        useApifyProxy: true,
       },
    };

    // Always use webhooks (including localhost)
    const payload: any = { ...input };
    payload.webhooks = [{
      eventTypes: ['ACTOR.RUN.SUCCEEDED','ACTOR.RUN.ABORTED'],
      requestUrl: `${BASE}/api/webhooks/actor1`,
      payloadTemplate: JSON.stringify({ runId: '{{runId}}', datasetId: '{{defaultDatasetId}}', userJobId: id })
    }];
    logger.debug('POST /api/jobs: actor1 SENT BODY::::', payload);
    const res = await fetch('https://api.apify.com/v2/acts/epctex~amazon-scraper/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APIFY_TOKEN}` },
      body: JSON.stringify(payload),
    });
    
    

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('actor1 start failed', { status: res.status, body: text });
      return NextResponse.json({ error: 'actor1 start failed' }, { status: 502 });
    }

    const data = await res.json().catch(() => ({}));
    const actor1RunId = data?.data?.id ?? null;

    await kvSet(`job:${id}`, {
      id, updatedAt: Date.now(),
      status: 'RUNNING_PRODUCT',
      keywords, marketplaces, endPage,
      actor1RunId,
    });

    logger.info('actor1 queued; waiting for webhook at /api/webhooks/actor1', {
      jobId: id,
      actor1RunId,
      webhookUrl: `${BASE}/api/webhooks/actor1`
    });
    return NextResponse.json({ jobId: id });
  } catch (err) {
    logger.error('POST /api/jobs: unhandled', { err: String(err) });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  } finally {
    logger.debug('POST /api/jobs: finished', { ms: Date.now() - startedAt });
  }
}
