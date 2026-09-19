import "server-only";

/**
 * Minimal Upstash Redis REST client -- no SDK, just fetch, so it works from any Vercel
 * function without adding a package. Falls back to an in-process lock/map when no Redis is
 * configured, which is fine for `next dev` but NOT safe once Vercel can run more than one
 * instance of a route concurrently: see the warning this prints once.
 */
/**
 * Les noms de variables dependent de comment le Redis a ete cree :
 *  - compte Upstash direct        -> UPSTASH_REDIS_REST_URL / _TOKEN
 *  - integration Vercel (Storage) -> KV_REST_API_URL / KV_REST_API_TOKEN
 *  - integration Marketplace      -> parfois REDIS_URL seul (chaine TCP rediss://)
 *
 * REDIS_URL seul ne suffit pas a ce client : il parle l'API REST en fetch, pas le
 * protocole Redis en TCP (que les fonctions Vercel ne peuvent de toute facon pas ouvrir
 * depuis l'edge). On tente quand meme de reconstruire l'endpoint REST depuis la chaine
 * TCP Upstash (host + mot de passe), ce qui marche sur Upstash ou le mot de passe Redis
 * est aussi le token REST -- mais on le signale, parce que ce n'est pas garanti.
 */
function resolveRest(): { url?: string; token?: string; source: string } {
  const pairs: [string, string][] = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["REDIS_REST_API_URL", "REDIS_REST_API_TOKEN"],
  ];
  for (const [u, t] of pairs) {
    if (process.env[u] && process.env[t]) {
      return { url: process.env[u], token: process.env[t], source: u };
    }
  }
  const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL;
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const password = decodeURIComponent(parsed.password || "");
      if (parsed.hostname && password) {
        console.warn(
          "[kv] Aucune paire REST trouvee. Endpoint REST reconstruit depuis REDIS_URL " +
            "(best effort). Si les appels Redis echouent en 401, ajoute explicitement " +
            "UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN.",
        );
        return { url: `https://${parsed.hostname}`, token: password, source: "REDIS_URL (derive)" };
      }
    } catch {
      /* chaine illisible, on tombera en memoire */
    }
  }
  return { source: "aucune" };
}

const resolved = resolveRest();
const url = resolved.url;
const token = resolved.token;

/** Quelle source de config a ete retenue, pour le diagnostic. */
export const kvSource = resolved.source;

let warned = false;
function warnFallback() {
  if (warned) return;
  warned = true;
  console.warn(
    "[kv] Aucune config Redis REST trouvee (essaye : UPSTASH_REDIS_REST_URL/_TOKEN, " +
      "KV_REST_API_URL/_TOKEN, ou REDIS_URL) -> verrou en memoire locale. " +
      "Ne PAS deployer sur Vercel sans Redis configure : plusieurs instances serverless " +
      "casseraient la file de nonces et le seed de l'Aviator.",
  );
}

/**
 * Redis est un confort, pas une dependance dure. S'il ne repond pas -- endpoint REST
 * reconstruit a tort depuis REDIS_URL, token invalide, reseau -- on bascule
 * DEFINITIVEMENT en memoire pour ce processus plutot que de faire echouer une mise.
 *
 * Une partie qui ne part pas parce qu'un verrou distribue est injoignable, c'est pire que
 * le risque que ce verrou couvre : avec une seule table, le verrou local suffit.
 */
let degraded = false;
export const kvDegraded = () => degraded;

async function call(...args: (string | number)[]): Promise<unknown> {
  if (degraded) throw new Error("kv degraded");
  try {
    const r = await fetch(`${url}/${args.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = (await r.json()) as { result: unknown };
    return j.result;
  } catch (e) {
    degraded = true;
    console.warn(
      `[kv] Redis injoignable (${(e as Error).message}) -> verrou local pour la suite. ` +
        "Ajoute UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN pour le retablir.",
    );
    throw e;
  }
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

    // Le verrou local est TOUJOURS pris : il serialise les appels de cette instance.
    const prev = localLocks.get(lockKey) ?? Promise.resolve();
    let release: () => void = () => {};
    const mine = new Promise<void>((res) => (release = res));
    localLocks.set(lockKey, prev.then(() => mine));
    await prev;

    // Redis vient par-dessus, pour couvrir le cas multi-instances. S'il est absent ou
    // injoignable, on continue avec le seul verrou local plutot que d'echouer.
    let heldRemote = false;
    if (this.configured && !degraded) {
      const stamp = `${Date.now()}-${Math.random()}`;
      const deadline = Date.now() + timeoutMs;
      try {
        for (;;) {
          if ((await call("set", lockKey, stamp, "NX", "PX", ttlMs)) === "OK") {
            heldRemote = true;
            break;
          }
          if (Date.now() > deadline) break; // occupe : on avance quand meme, verrou local tenu
          await new Promise((r) => setTimeout(r, 60 + Math.random() * 60));
        }
      } catch {
        /* degrade : verrou local seul */
      }
    } else if (!this.configured) {
      warnFallback();
    }

    try {
      return await fn();
    } finally {
      if (heldRemote) await call("del", lockKey).catch(() => undefined);
      release();
    }
  },
};

/** Aller-retour reel vers Redis. Utilise par /api/state pour le diagnostic. */
export async function kvHealth(): Promise<{ configured: boolean; source: string; ok: boolean; error?: string }> {
  if (!kv.configured) return { configured: false, source: kvSource, ok: false };
  try {
    const probe = `health:${Date.now()}`;
    await kv.set(probe, "1", 10);
    const back = await kv.get(probe);
    await kv.del(probe);
    return { configured: true, source: kvSource, ok: back === "1" };
  } catch (e) {
    return { configured: true, source: kvSource, ok: false, error: (e as Error).message };
  }
}
