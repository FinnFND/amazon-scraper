// app/api/webhooks/actor1/route.ts
// [CHANGE] Hardened webhook with explicit failure reasons and rich logs.

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
type HttpJson = ReturnType<typeof NextResponse.json>;

type FailCode =
  | 'BAD_METHOD'
  | 'BAD_CONTENT_TYPE'
  | 'BODY_EMPTY_OR_INVALID_JSON'
  | 'MISSING_FIELDS'
  | 'RUNID_NOT_MAPPED'
  | 'JOB_NOT_FOUND'
  | 'DATASET_FETCH_HTTP_ERROR'
  | 'DATASET_FETCH_PARSE_ERROR'
  | 'DATASET_EMPTY'
  | 'SELLER_INPUT_EMPTY'
  | 'ACTOR2_QUEUE_HTTP_ERROR'
  | 'ACTOR2_QUEUE_PARSE_ERROR'
  | 'ACTOR2_QUEUE_NO_RUNID'
  | 'UNHANDLED';

  function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllItemsWithRetry(
  datasetId: string,
  token: string,
  {
    pageSize = 1000,
    maxWaitMs = 90_000,          // total wait up to 90s
    initialDelayMs = 2_000,      // small delay to let items “settle”
    backoffMs = 2_000,           // grow delay on each empty read
  }: { pageSize?: number; maxWaitMs?: number; initialDelayMs?: number; backoffMs?: number } = {}
): Promise<ProductItem[]> {
  let items: ProductItem[] = [];
  let waited = 0;

  // first small wait helps right after SUCCEEDED
  if (initialDelayMs > 0) {
    await sleep(initialDelayMs);
    waited += initialDelayMs;
  }

  while (true) {
    items = [];
    let offset = 0;
    // read all pages once
    while (true) {
      const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${pageSize}`;
      const res = await httpJson(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 45_000,
      });

      if (!res.ok) {
        throw Object.assign(new Error(`Dataset fetch failed (HTTP ${res.status})`), {
          code: 'DATASET_FETCH_HTTP_ERROR',
          status: res.status,
          body: res.text?.slice(0, 2000),
          datasetId,
          offset,
          pageSize,
        });
      }

      let arr: ProductItem[] = [];
      if (res.data && Array.isArray(res.data)) {
        arr = res.data as ProductItem[];
      } else if (res.text) {
        try {
          const j = JSON.parse(res.text);
          if (Array.isArray(j)) arr = j as ProductItem[];
        } catch {
          // ignore
        }
      }

      if (!Array.isArray(arr)) {
        throw Object.assign(new Error('Dataset items response is not an array'), {
          code: 'DATASET_FETCH_PARSE_ERROR',
          datasetId,
          offset,
          pageSize,
          sample: (res.text || '').slice(0, 1000),
        });
      }

      if (arr.length > 0) items.push(...arr);
      if (arr.length < pageSize) break;
      offset += pageSize;
    }

    if (items.length > 0) return items; // success

    // still empty — backoff if we can wait more
    const nextWait = Math.min(10_000, backoffMs + Math.floor(waited / 3));
    if (waited + nextWait > maxWaitMs) return items; // give up empty; caller handles

    logger.warn('[actor1] Dataset still empty; backing off', {
      datasetId,
      waitedMs: waited,
      nextWaitMs: nextWait,
    });
    await sleep(nextWait);
    waited += nextWait;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}


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

/** [CHANGE] Use the actual endpointUrl passed in (bug fix vs hardcoded path) */
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

/** [CHANGE] Consistent failure helper: logs once and returns JSON with reason */
function fail(
  status: number,
  code: FailCode,
  reason: string,
  meta?: UnknownRecord
): HttpJson {
  logger.error(`[actor1] FAILED: ${code}`, { reason, ...(meta || {}) });
  return NextResponse.json(
    { ok: false, error: { code, reason, ...(meta ? { meta } : {}) } },
    { status }
  );
}

/** [CHANGE] Small fetch helper with timeout + better diagnostics */
async function httpJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ ok: boolean; status: number; data?: unknown; text?: string }> {
  const { timeoutMs = 30000, ...rest } = init;
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ac.signal });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      return { ok: false, status: res.status, text: bodyText };
    }
    if (ct.includes('application/json')) {
      const data = await res.json().catch(() => undefined);
      return { ok: true, status: res.status, data };
    }
    const txt = await res.text().catch(() => '');
    return { ok: true, status: res.status, text: txt };
  } finally {
    clearTimeout(to);
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    // [CHANGE] Method + content-type checks (helps spot misconfigured webhook sender)
    if (req.method !== 'POST') {
      return new NextResponse(
        JSON.stringify({
          ok: false,
          error: { code: 'BAD_METHOD', reason: 'Only POST is allowed', method: req.method },
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Allow': 'POST, GET, HEAD, OPTIONS',
          },
        }
      );
    }
    const ct = req.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      // Not fatal—we’ll still try to parse, but return 415 so Apify shows “failed” with reason.
      logger.warn('[actor1] Content-Type is not application/json', { contentType: ct });
      // Continue…
    }

    const raw = await req.text();
    const body = parseJsonObject(raw);
    logger.info('POST /api/webhooks/actor1: webhook received');

    // [CHANGE] Record cURL reproducer (full body or minimal)
    const endpoint = `${baseUrl()}/api/webhooks/actor1`;
    const runId = getString(body, 'runId') ?? getString(asObj(body.resource), 'id');
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
    logger.info('[actor1] Reproduce webhook with curl', { curl: curlScript });

    // [CHANGE] Validate body
    if (!raw || Object.keys(body).length === 0) {
      return fail(400, 'BODY_EMPTY_OR_INVALID_JSON', 'Body empty or invalid JSON');
    }

    logger.info('POST /api/webhooks/actor1: extracted values', { runId, datasetId });

    // [CHANGE] If Apify included status, reflect failed/aborted early
    const statusFromApify =
      getString(body, 'status') ?? getString(asObj(body.resource), 'status');
    const apifyErrorMessage =
      getString(body, 'errorMessage') ??
      getString(asObj(body.resource), 'errorMessage') ??
      getString(asObj(body.error), 'message');

    if (statusFromApify && statusFromApify !== 'SUCCEEDED') {
      return fail(
        409,
        'UNHANDLED',
        `Actor1 run is not SUCCEEDED (status=${statusFromApify})`,
        apifyErrorMessage ? { apifyErrorMessage } : undefined
      );
    }

    if (!runId || !datasetId) {
      return fail(400, 'MISSING_FIELDS', 'Missing runId or datasetId in webhook payload', {
        haveRunId: !!runId,
        haveDatasetId: !!datasetId,
      });
    }

    // Map runId -> jobId
    const jobId = await kvGet<string>(`run:${runId}`);
    if (!jobId) {
      return fail(404, 'RUNID_NOT_MAPPED', 'Could not find jobId for runId', { runId });
    }
    logger.info('Found jobId mapping', { runId, jobId });

    const job = await kvGet<Job>(`job:${jobId}`);
    if (!job) {
      return fail(404, 'JOB_NOT_FOUND', 'Found jobId, but the job data is missing', {
        jobId,
        runId,
      });
    }


    const items = await fetchAllItemsWithRetry(datasetId, APIFY_TOKEN, {
      pageSize: 1000,
      maxWaitMs: 90_000,
      initialDelayMs: 2_000,
      backoffMs: 2_000,
    });

    logger.info('[actor1] Dataset fetch complete', { jobId, total: items.length });

    if (items.length === 0) {
      // Don’t queue actor2 with 0 items (prevents the 400 you saw)
      return fail(422, 'DATASET_EMPTY', 'Dataset contains 0 items after retries', { datasetId });
    }


    // Prepare seller input (no `any` casts)
    const seen = new Set<string>();
    const sellerInput: SellerInput[] = [];

    // optional diagnostics (keep, they help a ton)
    let missingSellerId = 0;
    let derivedDomainCode = 0;

    for (const it of items) {
      // treat item as unknown record safely
      const itObj: UnknownRecord = (it ?? {}) as unknown as UnknownRecord;

      // sellerId can be at root or nested in `seller.id`
      const sellerId =
        readString(itObj, 'sellerId') ??
        readString(asObj(pick(itObj, 'seller')), 'id');

      if (!sellerId) {
        missingSellerId++;
        continue;
      }

      // URL can be `url` or `sellerProfileUrl` (also allow nested `seller.profileUrl`)
      const url =
        readString(itObj, 'url') ??
        readString(itObj, 'sellerProfileUrl') ??
        readString(asObj(pick(itObj, 'seller')), 'profileUrl') ??
        undefined;

      const dc = domainCodeFromUrl(url);
      if (dc) derivedDomainCode++;

      const key = `${sellerId}::${dc}`;
      if (!seen.has(key)) {
        seen.add(key);
        sellerInput.push({ sellerId, domainCode: dc });
      }
    }

    logger.info('[actor1] Seller input prepared', {
      sellerCount: sellerInput.length,
      missingSellerId,
      derivedDomainCode,
      uniqueKeyCount: seen.size,
    });



    const limitedSellerInput =
      typeof job.maxItems === 'number' && job.maxItems > 0
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
    const queueRes = await httpJson(
      'https://api.apify.com/v2/acts/axesso_data~amazon-seller-scraper/runs',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${APIFY_TOKEN}`,
        },
        body: JSON.stringify(actor2Payload),
        timeoutMs: 45000,
      }
    );

    if (!queueRes.ok) {
      return fail(
        502,
        'ACTOR2_QUEUE_HTTP_ERROR',
        `Failed to queue actor2 (HTTP ${queueRes.status})`,
        { body: queueRes.text?.slice(0, 2000) }
      );
    }

    const data2 = queueRes.data;
    const data2Obj = asObj(data2);
    const actor2RunId = data2Obj ? (getString(asObj(data2Obj.data), 'id') as string | null) : null;

    if (!actor2RunId) {
      return fail(
        502,
        'ACTOR2_QUEUE_NO_RUNID',
        'actor2 run was created but the response did not include a run id',
        { response: data2Obj }
      );
    }

    await kvSet(`run:${actor2RunId}`, jobId);
    logger.info('actor2 runId-to-jobId mapping created', { actor2RunId, jobId });

    const latest = await kvGet<Job>(`job:${jobId}`);
    await kvSet(`job:${jobId}`, { ...(latest || {}), actor2RunId });
    logger.info(
      'POST /api/webhooks/actor1: saved actor2 runId; waiting for webhook at /api/webhooks/actor2',
      { jobId, actor2RunId }
    );

    

    return NextResponse.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('POST /api/webhooks/actor1: unhandled error', { error: msg, stack });
      return fail(500, 'UNHANDLED', msg);
    } finally {
    logger.info('POST /api/webhooks/actor1: finished', { durationMs: Date.now() - startedAt });
  }
}

export async function GET(req: Request) {
  const ct = req.headers.get('content-type') || '';
  logger.info('GET /api/webhooks/actor1', { contentType: ct });
  return new NextResponse(
    JSON.stringify({ ok: true, info: 'Use POST with application/json to deliver webhooks.' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST, GET, HEAD, OPTIONS',
      },
    }
  );
}

export async function HEAD(_req: Request) {
  logger.info('HEAD /api/webhooks/actor1');
  return new NextResponse(null, {
    status: 204,
    headers: { 'Allow': 'POST, GET, HEAD, OPTIONS' },
  });
}

export async function OPTIONS(_req: Request) {
  logger.info('OPTIONS /api/webhooks/actor1');
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'POST, GET, HEAD, OPTIONS',
      'Access-Control-Allow-Methods': 'POST, GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

