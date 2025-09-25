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
};


