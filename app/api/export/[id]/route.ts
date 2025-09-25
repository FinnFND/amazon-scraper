import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { kvGet } from '@/lib/redis';
import { mergeProductsWithSellers } from '@/lib/merge';
import { rowsToWorkbook } from '@/lib/excel';
import type { ProductItem, SellerDetail } from '@/types/apify';
import logger from '@/lib/logger';
import type { Job } from '@/types/job';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const params = await context.params;
    logger.debug('GET /api/export/[id]: request received', { id: params.id });
    const job = await kvGet<Job>(`job:${params.id}`);
    if (!job || job.status !== 'SUCCEEDED' || !job.actor1DatasetId || !job.actor2DatasetId) {
      logger.warn('GET /api/export/[id]: job not ready', { id: params.id, jobStatus: job?.status });
      return NextResponse.json({ error: 'job not ready or dataset IDs are missing' }, { status: 400 });
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
        if (Array.isArray(chunk) && chunk.length > 0) prods.push(...chunk);
        if (!Array.isArray(chunk) || chunk.length < limit) break;
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
        if (Array.isArray(chunk) && chunk.length > 0) sellers.push(...chunk);
        if (!Array.isArray(chunk) || chunk.length < limit) break;
        offset += limit;
      }
    }

    // Filter to US/UK sellers only based on sellerDetails -> Business Address last segment
    const isAllowedCountry = (countryRaw: string | null | undefined): boolean => {
      if (!countryRaw) return false;
      const c = countryRaw.trim().toUpperCase();
      const normalize = (s: string) => s.replace(/\./g, '').trim();
      const country = normalize(c);
      const allowed = new Set([
        'US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA',
        'UK', 'GB', 'GBR', 'UNITED KINGDOM', 'GREAT BRITAIN',
        'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERN IRELAND'
      ]);
      return allowed.has(country);
    };

    const getBusinessAddressCountry = (details: Record<string, string> | null | undefined): string | null => {
      if (!details) return null;
      // find key case-insensitively, with or without trailing colon
      const key = Object.keys(details).find(k => k.toLowerCase().replace(/:$/,'') === 'business address');
      if (!key) return null;
      const addr = details[key];
      if (typeof addr !== 'string' || !addr.trim()) return null;
      const parts = addr.split('|');
      const last = parts.length ? parts[parts.length - 1] : addr;
      // Fallback to comma split if no pipes
      const cleaned = (parts.length ? last : (addr.split(',').slice(-1)[0] || last)).trim();
      return cleaned || null;
    };

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

    logger.debug('GET /api/export/[id]: merging datasets', { products: prodsFiltered.length, sellers: sellersFiltered.length, filteredOutProducts: prods.length - prodsFiltered.length, filteredOutSellers: sellers.length - sellersFiltered.length });
    const rows = mergeProductsWithSellers(prodsFiltered, sellersFiltered);
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
