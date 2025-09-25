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

export async function kvDel(key: string): Promise<void> {
  const started = Date.now();
  try {
    if (client) {
      await client.del(key);
      console.debug('[kvDel]', { key, persisted: true });
    } else {
      devStore.delete(key);
      console.debug('[kvDel][DEV]', { key });
    }
  } finally {
    console.debug('[kvDel finished]', { key, durationMs: Date.now() - started });
  }
}

export async function kvSAdd(key: string, ...members: string[]): Promise<void> {
  if (!members.length) return;
  const started = Date.now();
  try {
    if (client) {
      await client.sadd(key, ...(members as [string, ...string[]]));
      console.debug('[kvSAdd]', { key, count: members.length });
    } else {
      const existing = devStore.get(key);
      const set = existing instanceof Set ? existing : new Set<string>();
      for (const m of members) set.add(m);
      devStore.set(key, set);
      console.debug('[kvSAdd][DEV]', { key, count: members.length });
    }
  } finally {
    console.debug('[kvSAdd finished]', { key, durationMs: Date.now() - started });
  }
}

export async function kvSMembers(key: string): Promise<string[]> {
  const started = Date.now();
  try {
    if (client) {
      const arr = (await (client as unknown as { smembers: (k: string) => Promise<string[]> }).smembers(key)) as string[];
      console.debug('[kvSMembers]', { key, count: arr.length });
      return arr;
    } else {
      const existing = devStore.get(key);
      const set = existing instanceof Set ? (existing as Set<string>) : new Set<string>();
      const arr = Array.from(set);
      console.debug('[kvSMembers][DEV]', { key, count: arr.length });
      return arr;
    }
  } finally {
    console.debug('[kvSMembers finished]', { key, durationMs: Date.now() - started });
  }
}

export async function kvSRem(key: string, ...members: string[]): Promise<void> {
  if (!members.length) return;
  const started = Date.now();
  try {
    if (client) {
      await client.srem(key, ...(members as [string, ...string[]]));
      console.debug('[kvSRem]', { key, count: members.length });
    } else {
      const existing = devStore.get(key);
      const set = existing instanceof Set ? (existing as Set<string>) : new Set<string>();
      for (const m of members) set.delete(m);
      devStore.set(key, set);
      console.debug('[kvSRem][DEV]', { key, count: members.length });
    }
  } finally {
    console.debug('[kvSRem finished]', { key, durationMs: Date.now() - started });
  }
}