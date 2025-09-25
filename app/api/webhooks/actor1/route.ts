import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import { domainCodeFromUrl } from '@/lib/domain';
import type { ProductItem, SellerInput } from '@/types/apify';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';
import { BASE as BASE_FROM_ENV } from '@/lib/env';

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

/** Stable stringify so fields don't reorder between logs */
function stableJSONStringify(obj: UnknownRecord): string {
  const keys = Object.keys(obj).sort();
  const ordered: UnknownRecord = {};
  for (const k of keys) ordered[k] = obj[k];
  return JSON.stringify(ordered, null, 2);
}

/** Escape for inclusion inside single-quoted bash string */
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
    logger.info('POST /api/webhooks/actor1: webhook received');

    // Extract values we care about
    const runId =
      getString(body, 'runId') ?? getString(asObj(body.resource), 'id');
    const datasetId =
      getString(body, 'datasetId') ?? getString(asObj(body.resource), 'defaultDatasetId');

    // Log a reproducible curl (use full body if present; else minimal)
    const endpoint = `${baseUrl()}/api/webhooks/actor1`;
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
    logger.info('[actor1] Reproduce webhook with curl logged');

    logger.info('POST /api/webhooks/actor1: extracted values', { runId, datasetId });
    if (!runId || !datasetId) {
      logger.warn('Missing runId or datasetId in webhook payload');
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Map runId -> jobId
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

    // Fetch all dataset items
    const items: ProductItem[] = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
      const chunk: unknown = await res.json();
      const arr = Array.isArray(chunk) ? (chunk as ProductItem[]) : [];
      const len = arr.length;
      if (len > 0) items.push(...arr);
      if (len < limit) break;
      offset += limit;
    }
    logger.info('[actor1] Dataset fetch complete', { jobId, total: items.length });

    // Prepare seller input
    const seen = new Set<string>();
    const sellerInput: SellerInput[] = [];
    for (const it of items) {
      const sellerId = (it?.sellerId || it?.seller?.id || null) as string | null;
      if (!sellerId) continue;
      const dc = domainCodeFromUrl(it?.url ?? it?.sellerProfileUrl ?? undefined);
      const key = `${sellerId}::${dc}`;
      if (!seen.has(key)) {
        seen.add(key);
        sellerInput.push({ sellerId, domainCode: dc });
      }
    }
    logger.info('[actor1] Seller input prepared', { sellerCount: sellerInput.length });

    const limitedSellerInput = typeof job.maxItems === 'number' && job.maxItems > 0
      ? sellerInput.slice(0, job.maxItems)
      : sellerInput;

    await kvSet(`job:${jobId}`, {
      ...job,
      updatedAt: Date.now(),
      status: 'RUNNING_SELLER',
      actor1DatasetId: datasetId,
      productCount: items.length,
      sellerInput: limitedSellerInput,
    });
    logger.info('POST /api/webhooks/actor1: job updated to RUNNING_SELLER', {
      jobId,
      productCount: items.length,
    });

    // Start actor2 (no dynamic webhook here)
    const actor2Payload: UnknownRecord = { input: limitedSellerInput };
    const res2 = await fetch('https://api.apify.com/v2/acts/axesso_data~amazon-seller-scraper/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APIFY_TOKEN}` },
      body: JSON.stringify(actor2Payload),
    });

    logger.info('POST /api/webhooks/actor1: queued actor2', { status: res2.status, ok: res2.ok });
    const data2: unknown = await res2.json();
    const data2Obj = asObj(data2);
    const actor2RunId = data2Obj ? (getString(asObj(data2Obj.data), 'id') as string | null) : null;

    if (actor2RunId) {
      await kvSet(`run:${actor2RunId}`, jobId);
      logger.info('actor2 runId-to-jobId mapping created', { actor2RunId, jobId });
    }

    const latest = await kvGet<Job>(`job:${jobId}`);
    await kvSet(`job:${jobId}`, { ...(latest || {}), actor2RunId });
    logger.info('POST /api/webhooks/actor1: saved actor2 runId; waiting for webhook at /api/webhooks/actor2', {
      jobId,
      actor2RunId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('POST /api/webhooks/actor1: unhandled error', { error: String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    logger.info('POST /api/webhooks/actor1: finished', { durationMs: Date.now() - startedAt });
  }
}
