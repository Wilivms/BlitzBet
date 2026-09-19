import "server-only";

/**
 * Minimal Upstash Redis REST client -- no SDK, just fetch, so it works from any Vercel
 * function without adding a package. Falls back to an in-process lock/map when no Redis is
 * configured, which is fine for `next dev` but NOT safe once Vercel can run more than one
 * instance of a route concurrently: see the warning this prints once.
 */
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let warned = false;
function warnFallback() {
  if (warned) return;
  warned = true;
  console.warn(
    "[kv] UPSTASH_REDIS_REST_URL/TOKEN absents -> verrou en memoire locale. " +
      "Ne PAS deployer sur Vercel sans Redis configure : plusieurs instances serverless " +
      "casseraient la file de nonces et le seed de l'Aviator.",
  );
}

async function call(...args: (string | number)[]): Promise<unknown> {
  const r = await fetch(`${url}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`kv ${args[0]} failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { result: unknown };
  return j.result;
}

const memory = new Map<string, string>();
// In-memory fallback lock: a simple mutex per key, good enough for a single dev process.
const localLocks = new Map<string, Promise<void>>();

export const kv = {
  configured: Boolean(url && token),

  async get(key: string): Promise<string | null> {
    if (!this.configured) {
      warnFallback();
      return memory.get(key) ?? null;
    }
    return (await call("get", key)) as string | null;
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.configured) {
      warnFallback();
      memory.set(key, value);
      return;
    }
    if (ttlSeconds) await call("set", key, value, "EX", ttlSeconds);
    else await call("set", key, value);
  },

  async del(key: string): Promise<void> {
    if (!this.configured) {
      memory.delete(key);
      return;
    }
    await call("del", key);
  },

  /**
   * Distributed lock: run `fn` exclusively for `key` across every instance sharing this
   * Redis, not just this process. This is what makes nonce assignment safe when Vercel
   * scales a route out to several concurrent invocations -- without it, two instances can
   * both read "the chain's pending nonce is N" and both try to broadcast with nonce N.
   *
   * Deliberately a spin-lock with a short TTL rather than a queue: the critical section is
   * "read pending nonce, sign, broadcast" which finishes in well under a second, and a
   * hackathon table never has enough concurrent bettors to need anything fancier.
   */
  async withLock<T>(key: string, fn: () => Promise<T>, opts?: { ttlMs?: number; timeoutMs?: number }): Promise<T> {
    const ttlMs = opts?.ttlMs ?? 15_000;
    const timeoutMs = opts?.timeoutMs ?? 20_000;
    const lockKey = `lock:${key}`;

    if (!this.configured) {
      warnFallback();
      // Chain onto whatever is already queued for this key.
      const prev = localLocks.get(lockKey) ?? Promise.resolve();
      let release: () => void = () => {};
      const mine = new Promise<void>((res) => (release = res));
      localLocks.set(
        lockKey,
        prev.then(() => mine),
      );
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    }

    const token_ = `${Date.now()}-${Math.random()}`;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const acquired = await call("set", lockKey, token_, "NX", "PX", ttlMs);
      if (acquired === "OK") break;
      if (Date.now() > deadline) throw new Error("table occupee, reessayez");
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 60));
    }
    try {
      return await fn();
    } finally {
      // Best-effort release. If the TTL already expired under us, this is a harmless no-op
      // (or, worst case, releases a lock someone else has since acquired -- acceptable risk
      // at demo scale, and far better than blocking the table for 15s on every miss).
      await call("del", lockKey).catch(() => undefined);
    }
  },
};
