import ExcelJS from 'exceljs';
import type { MergedRow } from './merge';
import logger from './logger';

export async function rowsToWorkbook(rows: MergedRow[]): Promise<Uint8Array> {
  logger.info('rowsToWorkbook: start', { rows: rows.length });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Amazon Products + Sellers');

  const columns = [
    { header: 'Title', key: 'title', width: 50 },
    { header: 'ASIN', key: 'asin', width: 16 },
    { header: 'URL', key: 'url', width: 60 },
    { header: 'Brand', key: 'brand', width: 20 },
    { header: 'Price', key: 'price', width: 12 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'In Stock', key: 'inStock', width: 10 },
    { header: 'Categories', key: 'categories', width: 50 },
    { header: 'Seller ID', key: 'sellerId', width: 18 },
    { header: 'Seller Name', key: 'sellerName', width: 28 },
    { header: 'Domain Code', key: 'domainCode', width: 10 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Rating %', key: 'percentageRating', width: 10 },
    { header: 'Rating Count', key: 'countRating', width: 12 },
    { header: 'About Seller', key: 'aboutSeller', width: 60 },
    { header: 'Seller Store URL', key: 'sellerStoreUrl', width: 60 },
    { header: 'Seller Details (JSON)', key: 'sellerDetailsJson', width: 60 },

    // Ratings breakdown
    { header: '30d 5★', key: 'rating30d5', width: 10 },
    { header: '30d 4★', key: 'rating30d4', width: 10 },
    { header: '30d 3★', key: 'rating30d3', width: 10 },
    { header: '30d 2★', key: 'rating30d2', width: 10 },
    { header: '30d 1★', key: 'rating30d1', width: 10 },

    { header: '90d 5★', key: 'rating90d5', width: 10 },
    { header: '90d 4★', key: 'rating90d4', width: 10 },
    { header: '90d 3★', key: 'rating90d3', width: 10 },
    { header: '90d 2★', key: 'rating90d2', width: 10 },
    { header: '90d 1★', key: 'rating90d1', width: 10 },

    { header: '12m 5★', key: 'rating12m5', width: 10 },
    { header: '12m 4★', key: 'rating12m4', width: 10 },
    { header: '12m 3★', key: 'rating12m3', width: 10 },
    { header: '12m 2★', key: 'rating12m2', width: 10 },
    { header: '12m 1★', key: 'rating12m1', width: 10 },

    { header: 'Life 5★', key: 'ratingLt5', width: 10 },
    { header: 'Life 4★', key: 'ratingLt4', width: 10 },
    { header: 'Life 3★', key: 'ratingLt3', width: 10 },
    { header: 'Life 2★', key: 'ratingLt2', width: 10 },
    { header: 'Life 1★', key: 'ratingLt1', width: 10 },
  ];
  ws.columns = columns as unknown as ExcelJS.Column[];

  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };

  // ExcelJS returns Buffer in Node (subclass of Uint8Array) and ArrayBuffer in web.
  // We normalize to Uint8Array for Response compatibility.
  const out = await wb.xlsx.writeBuffer();
  const bytes = out instanceof ArrayBuffer ? new Uint8Array(out) : (out as unknown as Uint8Array);
  logger.info('rowsToWorkbook: done', { bytes: bytes.byteLength });
  return bytes;
}


