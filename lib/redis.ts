// lib/redis.ts
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// In dev, keep a global Map so it survives Fast Refresh
declare global {
  var __DEV_KV__: Map<string, unknown> | undefined;
}
if (!globalThis.__DEV_KV__) globalThis.__DEV_KV__ = new Map<string, unknown>();
const devStore: Map<string, unknown> = globalThis.__DEV_KV__!;

const client = url && token ? new Redis({ url, token }) : null;

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const started = Date.now();
  try {
    if (client) {
      const val = await client.get<T>(key);
      console.debug('[kvGet]', { key, hit: val != null });
      return val ?? undefined;
    } else {
      const v = devStore.get(key);
      console.debug('[kvGet][DEV]', { key, hit: v != null });
      if (v == null) return undefined;
      return v as T;
    }
  } finally {
    console.debug('[kvGet finished]', { key, durationMs: Date.now() - started });
  }
}

export async function kvSet<TValue = unknown>(key: string, value: TValue, ttlSeconds?: number): Promise<void> {
  const started = Date.now();
  try {
    if (client) {
      if (ttlSeconds) {
        await client.set(key, value, { ex: ttlSeconds });
      } else {
        await client.set(key, value);
      }
      console.debug('[kvSet]', { key, persisted: true, ttlSeconds: ttlSeconds ?? null });
    } else {
      devStore.set(key, value);
      console.debug('[kvSet][DEV]', { key });
    }
  } finally {
    console.debug('[kvSet finished]', { key, durationMs: Date.now() - started });
  }
}

// --- ADDED: Scans for and lists all job keys on startup ---
(async () => {
  if (!client) {
    console.log('Redis client not configured, skipping job scan.');
    return;
  }
  try {
    console.log('Scanning for all jobs with pattern "job:*"...');
    let cursor: number | string = 0;
    const allJobKeys: string[] = [];
    const matchPattern = 'job:*';

    do {
      const [newCursor, keys]: [string, string[]] = await client.scan(cursor, {
        match: matchPattern,
        count: 100,
      });

      if (keys.length > 0) {
        allJobKeys.push(...keys);
      }
      cursor = newCursor;
      // FIX: Compare the string cursor to the string '0' using strict inequality.
    } while (cursor !== '0');

    if (allJobKeys.length > 0) {
      console.log(`✅ Found ${allJobKeys.length} jobs:`);
      allJobKeys.sort().forEach(key => console.log(`  - ${key}`));
    } else {
      console.log('ℹ️ No jobs found matching the pattern "job:*".');
    }
  } catch (error) {
    console.error('❌ Failed to scan for jobs in Redis:', error);
  }
})();