// app/api/jobs/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { kvGet, kvDel, kvSRem, kvSet } from '@/lib/redis';
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

    // Augment with live progress if possible
    const APIFY_TOKEN = process.env.APIFY_TOKEN!;
    const headers = APIFY_TOKEN ? { Authorization: `Bearer ${APIFY_TOKEN}` } : undefined;
    const augmented: Record<string, unknown> = { ...job };

    // Helper to safely fetch JSON
    async function safeJson(url: string): Promise<unknown | null> {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }

    // Resolve dataset for a run if datasetId isn't persisted yet
    async function resolveDatasetIdForRun(runId: string): Promise<string | null> {
      const data = (await safeJson(`https://api.apify.com/v2/actor-runs/${runId}`)) as
        | { data?: { defaultDatasetId?: string } }
        | null;
      const datasetId = data?.data?.defaultDatasetId ?? null;
      return datasetId ?? null;
    }

    // Fetch dataset info and return itemCount
    async function datasetItemCount(datasetId: string): Promise<number | null> {
      const info = (await safeJson(`https://api.apify.com/v2/datasets/${datasetId}`)) as
        | { data?: { itemCount?: number } }
        | null;
      const count = info?.data?.itemCount;
      return typeof count === 'number' ? count : null;
    }

    try {
      if (job.status === 'RUNNING_PRODUCT' && job.actor1RunId) {
        let datasetId = job.actor1DatasetId ?? null;
        if (!datasetId) {
          datasetId = await resolveDatasetIdForRun(job.actor1RunId);
          if (datasetId) {
            augmented.actor1DatasetId = datasetId;
            // Best-effort persist for subsequent requests
            await kvSet(key, { ...job, actor1DatasetId: datasetId, updatedAt: Date.now() });
          }
        }
        if (datasetId) {
          const count = await datasetItemCount(datasetId);
          if (typeof count === 'number') augmented.productCountLive = count;
        }
      }

      if (job.status === 'RUNNING_SELLER' && job.actor2RunId) {
        let datasetId = job.actor2DatasetId ?? null;
        if (!datasetId) {
          datasetId = await resolveDatasetIdForRun(job.actor2RunId);
          if (datasetId) {
            augmented.actor2DatasetId = datasetId;
            await kvSet(key, { ...job, actor2DatasetId: datasetId, updatedAt: Date.now() });
          }
        }
        if (datasetId) {
          const count = await datasetItemCount(datasetId);
          if (typeof count === 'number') augmented.sellerCountLive = count;
        }
        const sellerTotal = Array.isArray(job.sellerInput) ? job.sellerInput.length : undefined;
        if (typeof sellerTotal === 'number') augmented.sellerTotal = sellerTotal;
      }
    } catch (e) {
      // Non-fatal; return whatever we have
      logger.debug('GET /api/jobs/[id]: progress augmentation failed', { id, error: String(e) });
    }

    logger.debug('GET /api/jobs/[id]: returning snapshot', {
      id,
      status: job.status,
      actor1RunId: job.actor1RunId ?? null,
      actor2RunId: job.actor2RunId ?? null,
      actor1DatasetId: (augmented.actor1DatasetId as string) ?? null,
      actor2DatasetId: (augmented.actor2DatasetId as string) ?? null,
      productCount: job.productCount ?? null,
      productCountLive: (augmented.productCountLive as number) ?? null,
      sellerCountLive: (augmented.sellerCountLive as number) ?? null,
    });

    return NextResponse.json(augmented);
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