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
      return val ?? undefined;
    } else {
      const v = devStore.get(key);
      if (v == null) return undefined;
      return v as T;
    }
  } finally {
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
    } else {
      devStore.set(key, value);
    }
  } finally {
  }
}

export async function kvDel(key: string): Promise<void> {
  const started = Date.now();
  try {
    if (client) {
      await client.del(key);
    } else {
      devStore.delete(key);
    }
  } finally {
  }
}

export async function kvSAdd(key: string, ...members: string[]): Promise<void> {
  if (!members.length) return;
  const started = Date.now();
  try {
    if (client) {
      await client.sadd(key, ...(members as [string, ...string[]]));
    } else {
      const existing = devStore.get(key);
      const set = existing instanceof Set ? existing : new Set<string>();
      for (const m of members) set.add(m);
      devStore.set(key, set);
    }
  } finally {
  }
}

export async function kvSMembers(key: string): Promise<string[]> {
  const started = Date.now();
  try {
    if (client) {
      const arr = (await (client as unknown as { smembers: (k: string) => Promise<string[]> }).smembers(key)) as string[];
      return arr;
    } else {
      const existing = devStore.get(key);
      const set = existing instanceof Set ? (existing as Set<string>) : new Set<string>();
      const arr = Array.from(set);
      return arr;
    }
  } finally {
  }
}

export async function kvSRem(key: string, ...members: string[]): Promise<void> {
  if (!members.length) return;
  const started = Date.now();
  try {
    if (client) {
      await client.srem(key, ...(members as [string, ...string[]]));
    } else {
      const existing = devStore.get(key);
      const set = existing instanceof Set ? (existing as Set<string>) : new Set<string>();
      for (const m of members) set.delete(m);
      devStore.set(key, set);
    }
  } finally {
  }
}