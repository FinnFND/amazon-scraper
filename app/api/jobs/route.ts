import { NextResponse } from 'next/server';
import { kvSet, kvGet, kvSMembers, kvSAdd } from '@/lib/redis';
import { nanoid } from 'nanoid';
import logger from '@/lib/logger';
import type { Job } from '@/types/job';
// IMPORTANT: this must be the raw JS string for Apify, not a function object.
import extendOutputFunction from '@/lib/extendOutputFunction'; // should export a STRING

const APIFY_TOKEN = process.env.APIFY_TOKEN!;

type Body = { keywords: string[]; marketplaces?: Array<'com'|'co.uk'>; endPage?: number; maxItems?: number };

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as Body;
    const keywords = (body.keywords || []).map(s => s.trim()).filter(Boolean);
    // Ensure we only ever use a single marketplace for actor1 (Apify supports one TLD per run)
    const marketplaces = (body.marketplaces?.length ? body.marketplaces : ['com']) as Array<'com'|'co.uk'>;
    const selectedMarket = marketplaces[0] || 'com';
    if (marketplaces.length > 1) {
      logger.warn('Multiple marketplaces requested; restricting to first', { marketplaces, selectedMarket });
    }
    const endPage = body.endPage ?? 7;
    const maxItems = typeof body.maxItems === 'number' && body.maxItems > 0 ? Math.floor(body.maxItems) : undefined;

    if (!keywords.length) {
      return NextResponse.json({ error: 'keywords required' }, { status: 400 });
    }

    // 1. This is your internal job ID. It stays the same.
    const jobId = nanoid();
    await kvSet(`job:${jobId}`, {
      id: jobId, createdAt: Date.now(), updatedAt: Date.now(),
      status: 'RUNNING_PRODUCT',
      keywords, marketplaces: [selectedMarket], endPage, maxItems
    });

    await kvSAdd('jobs', jobId);

    // Build Actor 1 input.
    // NOTE: We no longer need to define webhooks here, as we rely on the ones in the Apify UI.
    const payload = {
      search: keywords.join(' '),
      endPage,
      customMapFunction: '(object) => { return {...object} }',
      extendOutputFunction,
      amazonTld: selectedMarket === 'co.uk' ? '.co.uk' : '.com',
      ...(maxItems ? { maxItems } : {}),
      proxy: { 
        useApifyProxy: true,
      },
    };
    
    logger.info('POST /api/jobs: starting actor1', { keywords, selectedMarket, endPage, maxItems });
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
    logger.info('POST /api/jobs: finished', { ms: Date.now() - startedAt });
  }
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const ids = await kvSMembers('jobs');
    const jobs: Job[] = [];
    for (const id of ids) {
      const j = await kvGet<Job>(`job:${id}`);
      if (j) jobs.push(j);
    }
    // Newest first
    jobs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return NextResponse.json({ jobs });
  } catch (err) {
    logger.error('GET /api/jobs: unhandled', { err: String(err) });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  } finally {
    logger.info('GET /api/jobs: finished', { ms: Date.now() - startedAt });
  }
}
