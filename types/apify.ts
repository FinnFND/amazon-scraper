export type ProductItem = {
  type?: string;
  title?: string;
  url?: string;
  asin?: string;
  brand?: string;
  inStock?: boolean;
  price?: { value: number | null; currency: string | null } | null;
  categories?: string[];
  seller?: { name?: string; id?: string | null } | null;
  sellerId?: string | null;
  sellerIdSource?: string | null;
  sellerProfileUrl?: string | null;
  sellerStorefrontUrl?: string | null;
};

export type SellerInput = { sellerId: string; domainCode: string };

export type SellerDetail = {
  statusCode: number;
  statusMessage: string;
  sellerId: string;
  domainCode: string;
  aboutSeller?: string | null;
  sellerName?: string | null;
  storefrontUrl?: string | null;
  countRating?: number | null;
  percentageRating?: number | null;
  rating?: number | null;
  sellerContactPhone?: string | null;
  sellerDetails?: Record<string, string> | null;
  feedbackSummary?: any;
  feedback?: Array<{ rating: number; text: string; rater: string }>;
};


