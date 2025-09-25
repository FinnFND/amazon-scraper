import type { ProductItem, SellerDetail } from '@/types/apify';
import { domainCodeFromUrl } from './domain';
import logger from './logger';

export type MergedRow = {
  title?: string;
  asin?: string;
  url?: string;
  brand?: string;
  price?: number | null;
  currency?: string | null;
  inStock?: boolean;
  categories?: string;
  sellerId?: string | null;
  sellerName?: string | null;
  domainCode?: string;
  rating?: number | null;
  percentageRating?: number | null;
  countRating?: number | null;
  aboutSeller?: string | null;
  sellerStoreUrl?: string | null;

  sellerDetailsJson?: string | null;

  // Ratings breakdown per period (counts by star)
  rating30d5?: number | null;
  rating30d4?: number | null;
  rating30d3?: number | null;
  rating30d2?: number | null;
  rating30d1?: number | null;

  rating90d5?: number | null;
  rating90d4?: number | null;
  rating90d3?: number | null;
  rating90d2?: number | null;
  rating90d1?: number | null;

  rating12m5?: number | null;
  rating12m4?: number | null;
  rating12m3?: number | null;
  rating12m2?: number | null;
  rating12m1?: number | null;

  ratingLt5?: number | null;
  ratingLt4?: number | null;
  ratingLt3?: number | null;
  ratingLt2?: number | null;
  ratingLt1?: number | null;
};

export function mergeProductsWithSellers(products: ProductItem[], sellers: SellerDetail[]): MergedRow[] {
  logger.info('mergeProductsWithSellers: start', { products: products.length, sellers: sellers.length });
  const byId = new Map<string, SellerDetail>();
  for (const s of sellers) if (s.sellerId) byId.set(s.sellerId, s);

  const buildStoreUrl = (seller: SellerDetail | undefined, fallbackDomain: string | undefined): string | null => {
    if (!seller) return null;
    const path = seller.storefrontUrl || null;
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const domain = seller.domainCode || fallbackDomain || 'com';
    const prefix = `https://www.amazon.${domain}`;
    return `${prefix}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  type PeriodKey = 'thirtyDays' | 'ninetyDays' | 'twelveMonths' | 'lifeTime';
  const getCount = (o: unknown, key: string): number | null => {
    if (!o || typeof o !== 'object') return null;
    const v = (o as Record<string, unknown>)[key];
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseInt(v.replace(/[,\s]/g, ''), 10);
      return isNaN(n) ? null : n;
    }
    return null;
  };

  const extractFeedbackCounts = (seller: SellerDetail | undefined): Record<string, number | null> => {
    const out: Record<string, number | null> = {};
    const fs = seller?.feedbackSummary as Record<PeriodKey, Record<string, unknown>> | undefined;
    const periods: Array<{ key: PeriodKey; prefix: string }> = [
      { key: 'thirtyDays', prefix: 'rating30d' },
      { key: 'ninetyDays', prefix: 'rating90d' },
      { key: 'twelveMonths', prefix: 'rating12m' },
      { key: 'lifeTime', prefix: 'ratingLt' },
    ];
    for (const { key, prefix } of periods) {
      const obj = fs?.[key];
      out[`${prefix}5`] = getCount(obj, 'five_star');
      out[`${prefix}4`] = getCount(obj, 'four_star');
      out[`${prefix}3`] = getCount(obj, 'three_star');
      out[`${prefix}2`] = getCount(obj, 'two_star');
      out[`${prefix}1`] = getCount(obj, 'one_star');
    }
    return out;
  };

  const rows = products.map((p) => {
    const sellerId = p.sellerId ?? p.seller?.id ?? null;
    const dc = domainCodeFromUrl(p.url || p.sellerProfileUrl || undefined);
    const seller = sellerId ? byId.get(sellerId) : undefined;
    const storeUrl = buildStoreUrl(seller, dc);
    const counts = extractFeedbackCounts(seller);

    return {
      title: p.title,
      asin: p.asin,
      url: p.url,
      brand: p.brand,
      price: p.price?.value ?? null,
      currency: p.price?.currency ?? null,
      inStock: p.inStock ?? undefined,
      categories: p.categories?.join(' > ') ?? undefined,

      sellerId,
      sellerName: seller?.sellerName ?? undefined,
      domainCode: seller?.domainCode ?? dc,
      rating: seller?.rating ?? null,
      percentageRating: seller?.percentageRating ?? null,
      countRating: seller?.countRating ?? null,
      aboutSeller: seller?.aboutSeller ?? null,
      sellerStoreUrl: storeUrl,
      sellerDetailsJson: seller?.sellerDetails ? JSON.stringify(seller.sellerDetails) : null,

      rating30d5: counts.rating30d5 ?? null,
      rating30d4: counts.rating30d4 ?? null,
      rating30d3: counts.rating30d3 ?? null,
      rating30d2: counts.rating30d2 ?? null,
      rating30d1: counts.rating30d1 ?? null,

      rating90d5: counts.rating90d5 ?? null,
      rating90d4: counts.rating90d4 ?? null,
      rating90d3: counts.rating90d3 ?? null,
      rating90d2: counts.rating90d2 ?? null,
      rating90d1: counts.rating90d1 ?? null,

      rating12m5: counts.rating12m5 ?? null,
      rating12m4: counts.rating12m4 ?? null,
      rating12m3: counts.rating12m3 ?? null,
      rating12m2: counts.rating12m2 ?? null,
      rating12m1: counts.rating12m1 ?? null,

      ratingLt5: counts.ratingLt5 ?? null,
      ratingLt4: counts.ratingLt4 ?? null,
      ratingLt3: counts.ratingLt3 ?? null,
      ratingLt2: counts.ratingLt2 ?? null,
      ratingLt1: counts.ratingLt1 ?? null,
    } as MergedRow;
  });

  logger.info('mergeProductsWithSellers: done', { rows: rows.length });
  return rows;
}


