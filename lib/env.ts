// lib/env.ts
export const BASE = process.env.PUBLIC_BASE_URL || '';
export const IS_LOCAL =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE);
