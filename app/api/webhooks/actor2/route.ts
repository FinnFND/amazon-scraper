// app/api/webhooks/actor2/route.ts
// [CHANGE] Hardened webhook with explicit failure reasons and rich logs.

import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';
import { BASE as BASE_FROM_ENV } from '@/lib/env';

export const runtime = 'nodejs';

type UnknownRecord = Record<string, unknown>;
type HttpJson = ReturnType<typeof NextResponse.json>;

type FailCode =
  | 'BAD_METHOD'
  | 'BAD_CONTENT_TYPE'
  | 'BODY_EMPTY_OR_INVALID_JSON'
  | 'MISSING_FIELDS'
  | 'RUNID_NOT_MAPPED'
  | 'JOB_NOT_FOUND'
  | 'ACTOR2_NOT_SUCCEEDED'
  | 'UNHANDLED';

function parseJsonObject(s: string): UnknownRecord {
  try {
    const j: unknown = JSON.parse(s);
    if (j && typeof j === 'object' && !Array.isArray(j)) return j as UnknownRecord;
  } catch {}
  return {};
}

/** Safe key read returning a string or null */
function readString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === 'string') return v.trim();
  }
  return null;
}

/** Safe property pick (unknown) from an UnknownRecord */
function pick(obj: UnknownRecord | undefined, key: string): unknown {
  if (!obj) return undefined;
  return (obj as Record<string, unknown>)[key];
}


const asObj = (v: unknown): UnknownRecord | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as UnknownRecord) : undefined;

const getString = (obj: UnknownRecord | undefined, ...candidates: string[]): string | null => {
  if (!obj) return null;
  for (const cand of candidates) {
    const foundKey = Object.keys(obj).find((k) => k.toLowerCase() === cand.toLowerCase());
    if (!foundKey) continue;
    const v = obj[foundKey];
    if (typeof v === 'string') return v.trim();
  }
  return null;
};

function stableJSONStringify(obj: UnknownRecord): string {
  const keys = Object.keys(obj).sort();
  const ordered: UnknownRecord = {};
  for (const k of keys) ordered[k] = obj[k];
  return JSON.stringify(ordered, null, 2);
}

function bashSingleQuoteEscape(s: string): string {
  return s.replace(/'/g, `'\\''`);
}

/** [CHANGE] Fix: use correct endpoint for actor2 in the reproducer */
function buildCurlForLog(endpointUrl: string, payload: UnknownRecord): string {
  const json = stableJSONStringify(payload);
  const escaped = bashSingleQuoteEscape(json);
  const lines = [
    '#!/bin/bash',
    '',
    `curl -X POST 'http://localhost:3000/api/webhooks/actor1' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${escaped}'`,
    '',
  ];
  return lines.join('\n');
}

function baseUrl(): string {
  const raw = (BASE_FROM_ENV || process.env.PUBLIC_BASE_URL || 'http://localhost:3000').toString();
  return raw.replace(/\/+$/, '');
}

function fail(
  status: number,
  code: FailCode,
  reason: string,
  meta?: UnknownRecord
): HttpJson {
  logger.error(`[actor2] FAILED: ${code}`, { reason, ...(meta || {}) });
  return NextResponse.json(
    { ok: false, error: { code, reason, ...(meta ? { meta } : {}) } },
    { status }
  );
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    if (req.method !== 'POST') {
      return fail(405, 'BAD_METHOD', 'Only POST is allowed', { method: req.method });
    }
    const ct = req.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      logger.warn('[actor2] Content-Type is not application/json', { contentType: ct });
      // continue but return 415 so Apify shows failure if needed (or treat as soft)
    }

    const raw = await req.text();
    const body = parseJsonObject(raw);
    logger.info('POST /api/webhooks/actor2: webhook received');

    const endpoint = `${baseUrl()}/api/webhooks/actor2`;
    const runId =
      getString(body, 'runId') ?? getString(asObj(body.resource), 'id');
    const datasetId =
      getString(body, 'datasetId') ?? getString(asObj(body.resource), 'defaultDatasetId');

    const payloadForCurl: UnknownRecord =
      Object.keys(body).length > 0
        ? body
        : (() => {
            const minimal: UnknownRecord = {};
            if (runId) minimal.runId = runId;
            if (datasetId) minimal.datasetId = datasetId;
            return minimal;
          })();

    const curlScript = buildCurlForLog(endpoint, payloadForCurl);
    logger.info('[actor2] Reproduce webhook with curl', { curl: curlScript });

    if (!raw || Object.keys(body).length === 0) {
      return fail(400, 'BODY_EMPTY_OR_INVALID_JSON', 'Body empty or invalid JSON');
    }

    // [CHANGE] Respect Apify terminal statuses for actor2
    const statusFromApify =
      getString(body, 'status') ?? getString(asObj(body.resource), 'status');
    const apifyErrorMessage =
      getString(body, 'errorMessage') ??
      getString(asObj(body.resource), 'errorMessage') ??
      getString(asObj(body.error), 'message');

    if (!runId || !datasetId) {
      return fail(400, 'MISSING_FIELDS', 'Missing runId or datasetId in webhook payload', {
        haveRunId: !!runId,
        haveDatasetId: !!datasetId,
        statusFromApify,
      });
    }

    if (statusFromApify && statusFromApify !== 'SUCCEEDED') {
      return fail(
        409,
        'ACTOR2_NOT_SUCCEEDED',
        `Actor2 run is not SUCCEEDED (status=${statusFromApify})`,
        apifyErrorMessage ? { apifyErrorMessage } : undefined
      );
    }

    const jobId = await kvGet<string>(`run:${runId}`);
    if (!jobId) {
      return fail(404, 'RUNID_NOT_MAPPED', 'Could not find jobId for runId', { runId });
    }
    logger.info('Found jobId mapping', { runId, jobId });

    const job = await kvGet<Job>(`job:${jobId}`);
    if (!job) {
      return fail(404, 'JOB_NOT_FOUND', 'Found jobId, but the job data is missing', { jobId, runId });
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
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('POST /api/webhooks/actor2: unhandled error', { error: msg, stack });
      return fail(500, 'UNHANDLED', msg);
    } finally {
    logger.info('POST /api/webhooks/actor2: finished', { durationMs: Date.now() - startedAt });
  }
}
