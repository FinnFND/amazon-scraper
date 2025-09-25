export type JobStatus = 'PENDING' | 'RUNNING_PRODUCT' | 'RUNNING_SELLER' | 'SUCCEEDED' | 'FAILED';

export type Job = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: JobStatus;
  actor1RunId?: string;
  actor1DatasetId?: string;
  actor2RunId?: string;
  actor2DatasetId?: string;
  keywords: string[];
  marketplaces: Array<'com' | 'co.uk'>;
  endPage: number;
  maxItems?: number;
  productCount?: number;
  sellerInput?: { sellerId: string; domainCode: string }[];
  mergedKey?: string;
  error?: string;

  // Summary fields
  emptySellerIdCount?: number; // products with missing sellerId (likely Amazon Retail)
  duplicateSellerFromProductsCount?: number; // duplicate seller occurrences among products
  sellersOutOfCountryCount?: number; // sellers excluded due to non-US/UK address
};


