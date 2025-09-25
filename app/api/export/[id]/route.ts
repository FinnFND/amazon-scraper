import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { kvGet } from '@/lib/redis';
import { mergeProductsWithSellers } from '@/lib/merge';
import { rowsToWorkbook } from '@/lib/excel';
import type { ProductItem, SellerDetail } from '@/types/apify';
import logger from '@/lib/logger';
import type { Job } from '@/types/job';
import { getBusinessAddressCountry, isAllowedCountry } from '@/lib/country';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const params = await context.params;
    logger.info('GET /api/export/[id]: request received', { id: params.id });
    const job = await kvGet<Job>(`job:${params.id}`);
    if (!job || job.status !== 'SUCCEEDED' || !job.actor1DatasetId || !job.actor2DatasetId) {
      logger.warn('GET /api/export/[id]: job not ready', { id: params.id, jobStatus: job?.status });
      return NextResponse.json({ error: 'job not ready or dataset IDs are missing' }, { status: 400 });
    }

    const prods: ProductItem[] = [];
    {
      let offset = 0; const limit = 1000;
      logger.info('GET /api/export/[id]: fetching products', { datasetId: job.actor1DatasetId });
      while (true) {
        const url = `https://api.apify.com/v2/datasets/${job.actor1DatasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
        const chunk = await res.json();
        if (Array.isArray(chunk) && chunk.length > 0) prods.push(...chunk);
        if (!Array.isArray(chunk) || chunk.length < limit) break;
        offset += limit;
      }
    }

    const sellers: SellerDetail[] = [];
    {
      let offset = 0; const limit = 1000;
      logger.info('GET /api/export/[id]: fetching sellers', { datasetId: job.actor2DatasetId });
      while (true) {
        const url = `https://api.apify.com/v2/datasets/${job.actor2DatasetId}/items?clean=true&offset=${offset}&limit=${limit}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } });
        const chunk = await res.json();
        if (Array.isArray(chunk) && chunk.length > 0) sellers.push(...chunk);
        if (!Array.isArray(chunk) || chunk.length < limit) break;
        offset += limit;
      }
    }

    // Filter to US/UK sellers only based on sellerDetails -> Business Address last segment

    // Build set of allowed seller IDs
    const allowedSellerIds = new Set<string>();
    for (const s of sellers) {
      const country = getBusinessAddressCountry(s.sellerDetails ?? null);
      if (isAllowedCountry(country) && s.sellerId) allowedSellerIds.add(s.sellerId);
    }

    // Filter collections
    const sellersFiltered = sellers.filter(s => s.sellerId && allowedSellerIds.has(s.sellerId));
    const prodsFiltered: ProductItem[] = prods.filter(p => {
      const sid = (p.sellerId ?? (p.seller && p.seller.id) ?? null) as string | null;
      return !!(sid && allowedSellerIds.has(sid));
    });

    logger.info('GET /api/export/[id]: merging datasets', { products: prodsFiltered.length, sellers: sellersFiltered.length, filteredOutProducts: prods.length - prodsFiltered.length, filteredOutSellers: sellers.length - sellersFiltered.length });
    const rows = mergeProductsWithSellers(prodsFiltered, sellersFiltered);
    
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
    logger.info('GET /api/export/[id]: finished', { durationMs: Date.now() - startedAt });
  }
}
