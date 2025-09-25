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
      const normalize = (s: string) =>
        s
          .trim()
          .toUpperCase()
          // remove dots and common punctuation
          .replace(/[\.]/g, '')
          // collapse multiple spaces
          .replace(/\s+/g, ' ');

      // Strip wrapping parentheses if present (e.g., "United Kingdom (UK)")
      const stripParen = (s: string) => s.replace(/\([^)]*\)$/g, '').trim();

      const country = normalize(stripParen(countryRaw));

      // Canonical synonyms
      const synonyms: Record<string, string> = {
        'U K': 'UK',
        'U S': 'US',
        'UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND': 'UNITED KINGDOM',
      };
      const canonical = synonyms[country] || country;

      const allowed = new Set([
        'US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA',
        'UK', 'GB', 'GBR', 'UNITED KINGDOM', 'GREAT BRITAIN',
        'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERN IRELAND'
      ]);

      // Accept 2- or 3-letter codes that are explicitly allowed
      if (allowed.has(canonical)) return true;

      // Also accept if the last token is an allowed code/name
      const tokens = canonical.split(' ');
      const lastToken = tokens[tokens.length - 1];
      return allowed.has(lastToken);
    };

    const getBusinessAddressCountry = (details: Record<string, string> | null | undefined): string | null => {
      if (!details) return null;
      // find key case-insensitively, with or without trailing colon (ASCII or fullwidth) and extra whitespace
      const key = Object.keys(details).find(
        (k) => k.toLowerCase().trim().replace(/[:\uFF1A]$/,'') === 'business address'
      );
      if (!key) return null;
      const addr = details[key];
      if (typeof addr !== 'string') return null;
      const raw = addr.trim();
      if (!raw) return null;
      // Split by pipe first; fallback to comma; choose last non-empty segment
      const pipeParts = raw.split('|').map(s => s.trim()).filter(Boolean);
      const base = pipeParts.length > 0 ? pipeParts[pipeParts.length - 1] : raw;
      const commaParts = (pipeParts.length > 0 ? base : raw)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const last = commaParts.length > 0 ? commaParts[commaParts.length - 1] : base;
      // Remove trailing punctuation
      const cleaned = last.replace(/[\s]+$/g, '').replace(/[.,;]+$/g, '').trim();
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
