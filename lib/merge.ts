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
  sellerDetailsJson?: string | null;
};

export function mergeProductsWithSellers(products: ProductItem[], sellers: SellerDetail[]): MergedRow[] {
  logger.debug('mergeProductsWithSellers: start', { products: products.length, sellers: sellers.length });
  const byId = new Map<string, SellerDetail>();
  for (const s of sellers) if (s.sellerId) byId.set(s.sellerId, s);

  const rows = products.map((p) => {
    const sellerId = p.sellerId ?? p.seller?.id ?? null;
    const dc = domainCodeFromUrl(p.url || p.sellerProfileUrl || undefined);
    const seller = sellerId ? byId.get(sellerId) : undefined;

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
      sellerDetailsJson: seller?.sellerDetails ? JSON.stringify(seller.sellerDetails) : null,
    } as MergedRow;
  });

  logger.debug('mergeProductsWithSellers: done', { rows: rows.length });
  return rows;
}


