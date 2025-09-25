import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';

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
    logger.debug('POST /api/webhooks/actor2: webhook received', body);

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

    logger.debug('POST /api/webhooks/actor2: extracted values', { runId, datasetId });
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
