export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/redis';
import { IS_LOCAL } from '@/lib/env';
import { domainCodeFromUrl } from '@/lib/domain';
import type { Job } from '@/types/job';
import logger from '@/lib/logger';
// +++ Import Node.js built-in modules for file system and path operations
import { promises as fs } from 'fs';
import path from 'path';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;

// +++ Helper function to save mock data and generate cURL commands
async function saveMockData(filePath: string, data: any, curlCommand?: string) {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    logger.info(`[MOCKER] Saved response to ${filePath}`);
    if (curlCommand) {
      // Create a shell-safe version of the curl command
      const shellCommand = `#!/bin/bash\n# Make sure to set the APIFY_TOKEN environment variable\n# export APIFY_TOKEN="YourTokenHere"\n\n${curlCommand}`;
      const curlFilePath = `${filePath.replace(/\.json$/, '')}.curl.sh`;
      await fs.writeFile(curlFilePath, shellCommand);
      logger.info(`[MOCKER] Saved cURL command to ${curlFilePath}`);
      // Log the raw command for easy copy-pasting during development
      console.log(`\n--- cURL Command for ${path.basename(filePath)} ---\n${curlCommand}\n------------------------------------------\n`);
    }
  } catch (error) {
    logger.error('[MOCKER] Failed to save mock data', { filePath, error });
  }
}

async function getRun(runId: string, where: string) {
  logger.debug('[LOCAL] getRun -> calling Apify', { where, runId });
  const url = `https://api.apify.com/v2/actor-runs/${runId}`;
  
  // +++ Generate cURL command for the GET request
  const curlCommand = `curl "${url}" \\\n  -H "Authorization: Bearer $APIFY_TOKEN"`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
  });
  logger.debug('[LOCAL] getRun -> response', { where, runId, status: r.status, ok: r.ok });
  if (!r.ok) throw new Error(`actor-runs ${runId} -> ${r.status}`);

  const responseJson = await r.json();
  const { data } = responseJson;

  // +++ Save the full API response and the corresponding cURL command
  await saveMockData(`./apify_mocks/run_${runId}.json`, responseJson, curlCommand);

  logger.debug('[LOCAL] getRun -> parsed', { where, runId, status: data?.status, datasetId: data?.defaultDatasetId ?? null });
  return data as { status: string; defaultDatasetId?: string };
}

// Helper function to create a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchDatasetItems(datasetId: string, where:string) {
  logger.debug('[LOCAL] fetchDatasetItems -> start', { where, datasetId });
  const items: any[] = [];
  let offset = 0;
  const limit = 1000;

  for (let pageNum = 0; ; pageNum++) {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?offset=${offset}&limit=${limit}`;
    logger.debug('[LOCAL] fetchDatasetItems -> page', { where, datasetId, offset, limit, url });

    // +++ Generate and log the cURL command for fetching this specific page
    const pageCurlCommand = `curl "${url}" \\\n  -H "Authorization: Bearer $APIFY_TOKEN"`;
    console.log(`\n--- cURL for dataset ${datasetId} page ${pageNum} ---\n${pageCurlCommand}\n------------------------------------------\n`);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
    logger.debug('[LOCAL] fetchDatasetItems -> fetch response', { where, datasetId, offset, status: res.status, ok: res.ok });
    const chunk = await res.json();
    
    // +++ Save each individual page/chunk to a file
    await saveMockData(
      `./apify_mocks/dataset_${datasetId}_page_${pageNum}.json`,
      chunk
    );
    
    const len = Array.isArray(chunk) ? chunk.length : 0;
    logger.debug('[LOCAL] fetchDatasetItems -> chunk', { where, datasetId, offset, len });
    items.push(...chunk);
    if (len < limit) break;
    offset += limit;
  }

  // +++ After fetching all pages, save the complete combined dataset
  await saveMockData(`./apify_mocks/dataset_${datasetId}_complete.json`, items);

  logger.debug('[LOCAL] fetchDatasetItems -> done', { where, datasetId, total: items.length });
  return items;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const key = `job:${id}`;
  const startedAt = Date.now();

  logger.debug('GET /api/jobs/[id]: request received', { id, IS_LOCAL });

  try {
    let job = await kvGet<Job>(key);
    if (!job) {
      logger.warn('GET /api/jobs/[id]: job not found', { id });
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    logger.debug('GET /api/jobs/[id]: current job snapshot', {
      id,
      status: job.status,
      // ... (rest of the log is fine)
    });

    if (IS_LOCAL) {
      // ---- POLL ACTOR 1 ----------------------------------------------------
      if (job.status === 'RUNNING_PRODUCT' && job.actor1RunId) {
        logger.debug('[LOCAL] polling actor1', { id, actor1RunId: job.actor1RunId });
        try {
          const run1 = await getRun(job.actor1RunId, 'actor1');
          logger.debug('[LOCAL] actor1 status', { id, actor1RunId: job.actor1RunId, status: run1.status });

          if (run1.status === 'SUCCEEDED' && run1.defaultDatasetId) {
            logger.info('[LOCAL] actor1 SUCCEEDED; fetching dataset', {
              id,
              actor1RunId: job.actor1RunId,
              datasetId: run1.defaultDatasetId,
            });

            await sleep(3000);
            const products = await fetchDatasetItems(run1.defaultDatasetId, 'actor1');
            logger.debug('[LOCAL] building sellerInput', { id, products: products.length });

            const seen = new Set<string>();
            const sellerInput: Array<{ sellerId: string; domainCode: string }> = [];
            for (const it of products) {
              let sellerId = it?.sellerId || it?.seller?.id || null;
              let sellerProfileUrl = it?.sellerProfileUrl || null;

              logger.debug('[LOCAL] sellerInput', { id, sellerId, sellerProfileUrl });
              if (!sellerId) continue;
              
              const dc = domainCodeFromUrl(it?.url ?? sellerProfileUrl ?? undefined);
              const sig = `${sellerId}::${dc}`;
              if (!seen.has(sig)) {
                seen.add(sig);
                sellerInput.push({ sellerId, domainCode: dc });
              }
            }

            logger.info('[LOCAL] kicking actor2 (no webhooks local)', {
              id,
              sellerCount: sellerInput.length,
            });

            // +++ CONSTRUCT ACTOR 2 REQUEST AND cURL COMMAND
            const actor2Url = 'https://api.apify.com/v2/acts/axesso_data~amazon-seller-scraper/runs';
            const actor2Body = { input: sellerInput };
            
            // Escape single quotes in the JSON string for shell safety
            const actor2BodyString = JSON.stringify(actor2Body).replace(/'/g, "'\\''");

            const actor2CurlCommand = `curl -X POST "${actor2Url}" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $APIFY_TOKEN" \\\n  -d '${actor2BodyString}'`;
            
            // +++ Save the request body and the generated cURL command
            await saveMockData(
              `./apify_mocks/actor2_start_request_for_job_${id}.json`,
              actor2Body,
              actor2CurlCommand
            );
            
            const res2 = await fetch(actor2Url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APIFY_TOKEN}` },
              body: JSON.stringify(actor2Body), // Use the unescaped version for the fetch call
            });

            const data2 = await res2.json();
            
            // +++ Save the response from starting actor 2
            await saveMockData(
              `./apify_mocks/actor2_start_response_for_job_${id}.json`,
              data2
            );

            logger.debug('[LOCAL] actor2 start response', {  data: data2 });
            const actor2RunId = data2?.data?.id ?? null;
            logger.info('[LOCAL] actor2 started', { id, actor2RunId });

            job = {
              ...job,
              updatedAt: Date.now(),
              status: 'RUNNING_SELLER',
              actor1DatasetId: run1.defaultDatasetId,
              productCount: products.length,
              sellerInput,
              actor2RunId,
            };
            await kvSet(key, job);
            logger.debug('[LOCAL] job updated -> RUNNING_SELLER', { id });
          } else {
            logger.debug('[LOCAL] actor1 not done yet; keep polling', {
              id,
              actor1RunId: job.actor1RunId,
              status: run1.status,
            });
          }
        } catch (e: any) {
          logger.warn('[LOCAL] actor1 poll error (will keep polling)', { id, error: e.message });
        }
      }

      // ---- POLL ACTOR 2 ----------------------------------------------------
      if (job.status === 'RUNNING_SELLER' && job.actor2RunId) {
        logger.debug('[LOCAL] polling actor2', { id, actor2RunId: job.actor2RunId });
        try {
          const run2 = await getRun(job.actor2RunId, 'actor2');
          logger.debug('[LOCAL] actor2 status', { id, actor2RunId: job.actor2RunId, status: run2.status });

          if (run2.status === 'SUCCEEDED' && run2.defaultDatasetId) {
            
            // +++ Fetching actor 2 dataset items when it succeeds
            await fetchDatasetItems(run2.defaultDatasetId, 'actor2');

            job = {
              ...job,
              updatedAt: Date.now(),
              status: 'SUCCEEDED',
              actor2DatasetId: run2.defaultDatasetId,
            };
            await kvSet(key, job);
            logger.info('[LOCAL] job marked SUCCEEDED', { id, actor2DatasetId: run2.defaultDatasetId });
          } else {
            logger.debug('[LOCAL] actor2 not done yet; keep polling', {
              id,
              actor2RunId: job.actor2RunId,
              status: run2.status,
            });
          }
        } catch (e: any) {
          logger.warn('[LOCAL] actor2 poll error (will keep polling)', { id, error: e.message });
        }
      }
    }

    logger.debug('GET /api/jobs/[id]: returning snapshot', {
      id,
      status: job.status,
      // ... (rest of the log is fine)
    });

    return NextResponse.json(job);
  } catch (err: any) {
    logger.error('GET /api/jobs/[id]: unhandled error', { id, error: err.message });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  } finally {
    logger.debug('GET /api/jobs/[id]: finished', { id, durationMs: Date.now() - startedAt });
  }
}