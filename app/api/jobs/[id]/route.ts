// app/api/jobs/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { kvGet, kvDel, kvSRem } from '@/lib/redis';
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

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const startedAt = Date.now();
  logger.debug('DELETE /api/jobs/[id]: request received', { id });
  try {
    const job = await kvGet<Job>(`job:${id}`);
    if (!job) {
      return NextResponse.json({ ok: true });
    }

    // Attempt to delete Apify datasets if present (best-effort)
    const APIFY_TOKEN = process.env.APIFY_TOKEN!;
    const headers = { Authorization: `Bearer ${APIFY_TOKEN}` } as Record<string, string>;
    const deletes: Promise<unknown>[] = [];
    if (job.actor1DatasetId) {
      deletes.push(fetch(`https://api.apify.com/v2/datasets/${job.actor1DatasetId}`, { method: 'DELETE', headers }));
    }
    if (job.actor2DatasetId) {
      deletes.push(fetch(`https://api.apify.com/v2/datasets/${job.actor2DatasetId}`, { method: 'DELETE', headers }));
    }
    await Promise.allSettled(deletes);

    // Remove keys
    if (job.actor1RunId) await kvDel(`run:${job.actor1RunId}`);
    if (job.actor2RunId) await kvDel(`run:${job.actor2RunId}`);
    await kvDel(`job:${id}`);
    await kvSRem('jobs', id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('DELETE /api/jobs/[id]: unhandled error', { id, error: message });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  } finally {
    logger.debug('DELETE /api/jobs/[id]: finished', { id, durationMs: Date.now() - startedAt });
  }
}