import ExcelJS from 'exceljs';
import type { MergedRow } from './merge';
import logger from './logger';

export async function rowsToWorkbook(rows: MergedRow[]): Promise<Uint8Array> {
  logger.debug('rowsToWorkbook: start', { rows: rows.length });
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
    { header: 'Seller Details (JSON)', key: 'sellerDetailsJson', width: 60 },
  ];
  ws.columns = columns as unknown as ExcelJS.Column[];

  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };

  // ExcelJS returns Buffer in Node (subclass of Uint8Array) and ArrayBuffer in web.
  // We normalize to Uint8Array for Response compatibility.
  const out = await wb.xlsx.writeBuffer();
  const bytes = out instanceof ArrayBuffer ? new Uint8Array(out) : (out as unknown as Uint8Array);
  logger.debug('rowsToWorkbook: done', { bytes: bytes.byteLength });
  return bytes;
}


