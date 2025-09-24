// app/api/export/[id]/route.ts
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { kvGet } from '@/lib/redis';
import { mergeProductsWithSellers } from '@/lib/merge';
import { rowsToWorkbook } from '@/lib/excel';
import type { ProductItem, SellerDetail } from '@/types/apify';
import logger from '@/lib/logger';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const params = await context.params;
    logger.debug('GET /api/export/[id]: request received', { id: params.id });
    const job = await kvGet<{ status: string; actor1DatasetId: string; actor2DatasetId: string }>(`job:${params.id}`);
    if (!job || job.status !== 'SUCCEEDED') {
      logger.warn('GET /api/export/[id]: job not ready', { id: params.id, jobStatus: job?.status });
      return NextResponse.json({ error: 'job not ready' }, { status: 400 });
    }

    const prods: ProductItem[] = [];
    {
      let offset = 0; const limit = 1000;
      while (true) {
        const url = `https://api.apify.com/v2/datasets/${job.actor1DatasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
        logger.debug('GET /api/export/[id]: fetching products chunk', { url, offset, limit });
        const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
        logger.debug('GET /api/export/[id]: products response', { status: res.status, ok: res.ok });
        const chunk = await res.json();
        prods.push(...chunk);
        if (chunk.length < limit) break;
        offset += limit;
      }
    }

    const sellers: SellerDetail[] = [];
    {
      let offset = 0; const limit = 1000;
      while (true) {
        const url = `https://api.apify.com/v2/datasets/${job.actor2DatasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
        logger.debug('GET /api/export/[id]: fetching sellers chunk', { url, offset, limit });
        const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
        logger.debug('GET /api/export/[id]: sellers response', { status: res.status, ok: res.ok });
        const chunk = await res.json();
        sellers.push(...chunk);
        if (chunk.length < limit) break;
        offset += limit;
      }
    }

    logger.debug('GET /api/export/[id]: merging datasets', { products: prods.length, sellers: sellers.length });
    const rows = mergeProductsWithSellers(prods, sellers);
    logger.debug('GET /api/export/[id]: creating workbook', { rows: rows.length });
    const buf = await rowsToWorkbook(rows);
    logger.info('GET /api/export/[id]: workbook ready', { id: params.id, bytes: (buf as Uint8Array).byteLength });

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="amazon-products-sellers-${params.id}.xlsx"`,
        'Cache-Control': 'no-store',
      }
    });
  } catch (err) {
    logger.error('GET /api/export/[id]: unhandled error', { error: String(err) });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  } finally {
    logger.debug('GET /api/export/[id]: finished', { durationMs: Date.now() - startedAt });
  }
}


