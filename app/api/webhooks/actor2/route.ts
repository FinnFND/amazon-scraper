import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';
import { BASE, IS_LOCAL } from '@/lib/env'; // <-- NEW
import { writeFile, chmod } from 'node:fs/promises'; // <-- NEW
import path from 'node:path'; // <-- NEW

export const runtime = 'nodejs';

// NEW: helper to write a local curl replay script
async function writeCurlReplayScript(filename: string, endpoint: string, payloadRaw: string) {
  try {
    let pretty = payloadRaw;
    try {
      pretty = JSON.stringify(JSON.parse(payloadRaw), null, 2);
    } catch {}
    const safeJson = pretty.replace(/'/g, `'\\''`);
    const base = BASE || 'http://localhost:3000';
    const url = `${base}${endpoint}`;
    const script = `#!/bin/bash

curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -d '${safeJson}'
`;
    const outPath = path.resolve(process.cwd(), filename);
    await writeFile(outPath, script, 'utf8');
    try { await chmod(outPath, 0o755); } catch {}
    logger.debug(`Wrote local replay script ${filename}`, { outPath });
  } catch (e) {
    logger.warn('Failed to write local replay script', { error: String(e) });
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const raw = await req.text();

    // NEW: always record the exact incoming payload when developing locally
    if (IS_LOCAL && raw && raw.trim()) {
      await writeCurlReplayScript('curl_actor2.sh', '/api/webhooks/actor2', raw);
    }

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
      actor2DatasetId: datasetId,
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
