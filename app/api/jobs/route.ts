import { NextResponse } from 'next/server';
import { kvSet, kvGet } from '@/lib/redis';
import { nanoid } from 'nanoid';
import logger from '@/lib/logger';
import type { Job } from '@/types/job';
// IMPORTANT: this must be the raw JS string for Apify, not a function object.
import extendOutputFunction from '@/lib/extendOutputFunction'; // should export a STRING

const APIFY_TOKEN = process.env.APIFY_TOKEN!;

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

    // 1. This is your internal job ID. It stays the same.
    const jobId = nanoid();
    await kvSet(`job:${jobId}`, {
      id: jobId, createdAt: Date.now(), updatedAt: Date.now(),
      status: 'RUNNING_PRODUCT',
      keywords, marketplaces, endPage
    });

    // Build Actor 1 input.
    // NOTE: We no longer need to define webhooks here, as we rely on the ones in the Apify UI.
    const payload = {
      search: keywords.join(' '),
      endPage,
      customMapFunction: '(object) => { return {...object} }',
      extendOutputFunction,
      maxItems: 1, // This is low, for testing. You might want to increase it.
      proxy: { 
        useApifyProxy: true,
      },
    };
    
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

    if (!actor1RunId) {
        logger.error('actor1 start succeeded but no runId was returned');
        return NextResponse.json({ error: 'actor1 start failed to return runId' }, { status: 502 });
    }
    
    // 2. Create the crucial link in Redis: runId -> jobId
    await kvSet(`run:${actor1RunId}`, jobId);
    logger.info('actor1 runId-to-jobId mapping created', { actor1RunId, jobId });

    // 3. Update the main job object with the actor's runId
    const currentJob = await kvGet<Job>(`job:${jobId}`);
    await kvSet(`job:${jobId}`, {
      ...currentJob,
      updatedAt: Date.now(),
      actor1RunId,
    });

    logger.info('actor1 queued; waiting for UI webhook', {
      jobId: jobId,
      actor1RunId,
    });
    return NextResponse.json({ jobId: jobId });

  } catch (err) {
    logger.error('POST /api/jobs: unhandled', { err: String(err) });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  } finally {
    logger.debug('POST /api/jobs: finished', { ms: Date.now() - startedAt });
  }
}
