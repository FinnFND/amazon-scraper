export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/redis';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; // IMPORTANT: await
  const key = `job:${id}`;
  const startedAt = Date.now();

  logger.debug('GET /api/jobs/[id]: request received', { id });

  try {
    const job = await kvGet<Job>(key);
    if (!job) {
      logger.warn('GET /api/jobs/[id]: job not found', { id });
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    logger.debug('GET /api/jobs/[id]: returning snapshot', {
      id,
      status: job.status,
      actor1RunId: job.actor1RunId ?? null,
      actor2RunId: job.actor2RunId ?? null,
      actor1DatasetId: job.actor1DatasetId ?? null,
      actor2DatasetId: job.actor2DatasetId ?? null,
      productCount: job.productCount ?? null,
    });

    return NextResponse.json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('GET /api/jobs/[id]: unhandled error', { id, error: message });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  } finally {
    logger.debug('GET /api/jobs/[id]: finished', { id, durationMs: Date.now() - startedAt });
  }
}