import type { SellerDetail } from '@/types/apify';

// Normalize and evaluate whether a country string is allowed (US/UK variants)
export function isAllowedCountry(countryRaw: string | null | undefined): boolean {
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

  const allowed = new Set<string>([
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
}

// Extract the country name from sellerDetails -> Business Address
export function getBusinessAddressCountry(details: Record<string, string> | null | undefined): string | null {
  if (!details) return null;
  // find key case-insensitively, with or without trailing colon (ASCII or fullwidth) and extra whitespace
  const key = Object.keys(details).find(
    (k) => k.toLowerCase().trim().replace(/[:\uFF1A]$/, '') === 'business address'
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
}

// Utility to count sellers that are outside allowed countries
export function countOutOfCountrySellers(sellers: SellerDetail[]): number {
  let count = 0;
  for (const s of sellers) {
    const country = getBusinessAddressCountry(s.sellerDetails ?? null);
    if (!isAllowedCountry(country)) count++;
  }
  return count;
}


