// app/api/webhooks/actor2/route.ts
import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const { userJobId: jobId, datasetId } = await req.json();
    logger.debug('POST /api/webhooks/actor2: webhook received', { jobId, datasetId });
    if (!jobId || !datasetId) return NextResponse.json({ ok: false }, { status: 400 });

    const job = await kvGet<Job>(`job:${jobId}`);
    if (!job) return NextResponse.json({ ok: false }, { status: 404 });

    await kvSet(`job:${jobId}`, {
      ...job,
      updatedAt: Date.now(),
      status: 'SUCCEEDED',
      actor2DatasetId: datasetId
    });
    logger.info('POST /api/webhooks/actor2: job marked as SUCCEEDED', { jobId });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('POST /api/webhooks/actor2: unhandled error', { error: String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    logger.debug('POST /api/webhooks/actor2: finished', { durationMs: Date.now() - startedAt });
  }
}


