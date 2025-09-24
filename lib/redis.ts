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
