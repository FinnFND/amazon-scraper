import logger from './logger';

export function domainCodeFromUrl(url?: string): string {
  try {
    if (!url) return 'com';
    const h = new URL(url).hostname;
    if (h.endsWith('amazon.co.uk')) return 'co.uk';
    if (h.endsWith('amazon.de')) return 'de';
    if (h.endsWith('amazon.com')) return 'com';
    const m = h.match(/amazon\.([a-z.]+)/i);
    return m?.[1] ?? 'com';
  } catch (err) {
    logger.warn('domainCodeFromUrl: failed to parse URL', { url, error: String(err) });
    return 'com';
  }
}


