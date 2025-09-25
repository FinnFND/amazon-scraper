import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';
import { BASE as BASE_FROM_ENV } from '@/lib/env';
import type { SellerDetail } from '@/types/apify';
import { countOutOfCountrySellers } from '@/lib/country';
const APIFY_TOKEN = process.env.APIFY_TOKEN!;

export const runtime = 'nodejs';

type UnknownRecord = Record<string, unknown>;

function parseJsonObject(s: string): UnknownRecord {
  try {
    const j: unknown = JSON.parse(s);
    if (j && typeof j === 'object' && !Array.isArray(j)) return j as UnknownRecord;
  } catch {}
  return {};
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

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const raw = await req.text();
    const body = parseJsonObject(raw);
    logger.info('POST /api/webhooks/actor2: webhook received');

    // Extract as per your actor2 template:
    // { "runId": "{{resource.id}}", "datasetId": "{{resource.defaultDatasetId}}" }
    const runId =
      getString(body, 'runId') ?? getString(asObj(body.resource), 'id');
    const datasetId =
      getString(body, 'datasetId') ?? getString(asObj(body.resource), 'defaultDatasetId');

    // Log reproducible curl (prefer full body; fall back to minimal)
    const endpoint = `${baseUrl()}/api/webhooks/actor2`;
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
    logger.info('[actor2] Reproduce webhook with curl logged');

    logger.info('POST /api/webhooks/actor2: extracted values', { runId, datasetId });
    if (!runId || !datasetId) {
      logger.warn('Missing runId or datasetId in webhook payload');
      return NextResponse.json({ ok: false }, { status: 400 });
    }

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

    // Optionally compute out-of-country count now that we have seller dataset
    let sellersOutOfCountryCount: number | undefined = undefined;
    try {
      const sellers: SellerDetail[] = [];
      let offset = 0;
      const limit = 1000;
      while (true) {
        const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
        const chunk: unknown = await res.json();
        const arr = Array.isArray(chunk) ? (chunk as SellerDetail[]) : [];
        const len = arr.length;
        if (len > 0) sellers.push(...arr);
        if (len < limit) break;
        offset += limit;
      }
      sellersOutOfCountryCount = countOutOfCountrySellers(sellers);
      logger.info('[actor2] Computed sellersOutOfCountryCount', { sellersOutOfCountryCount });
    } catch (e) {
      logger.warn('[actor2] Failed to compute sellersOutOfCountryCount; continuing', { error: String(e) });
    }

    await kvSet(`job:${jobId}`, {
      ...job,
      updatedAt: Date.now(),
      status: 'SUCCEEDED',
      actor2DatasetId: datasetId,
      ...(typeof sellersOutOfCountryCount === 'number' ? { sellersOutOfCountryCount } : {}),
    });
    logger.info('POST /api/webhooks/actor2: job marked as SUCCEEDED', { jobId });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('POST /api/webhooks/actor2: unhandled error', { error: String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    logger.info('POST /api/webhooks/actor2: finished', { durationMs: Date.now() - startedAt });
  }
}
