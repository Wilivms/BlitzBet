import "server-only";

/**
 * Cache mémoire à durée de vie courte.
 *
 * Le RPC public plafonne à ~15 requêtes/seconde. /api/state fait 6 eth_call par appel ;
 * l'écran de table poll à 900 ms et l'Aviator à 450 ms. Sans cache, un seul écran
 * consomme déjà ~20 appels/s et chaque téléphone qui rejoint aggrave la situation :
 * le RPC renvoie alors "requests limited to 15/sec" et toute la table tombe.
 *
 * Avec un TTL de 700 ms, N clients coûtent le même nombre d'appels RPC qu'un seul.
 */
type Entry = { value: unknown; expires: number; inflight?: Promise<unknown> };
const store = new Map<string, Entry>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expires > now) return hit.value as T;
  // Une seule requête en vol par clé : dix clients simultanés ne déclenchent qu'un appel RPC.
  if (hit?.inflight) return hit.inflight as Promise<T>;

  const inflight = load()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      store.delete(key);
      throw err;
    });

  store.set(key, { value: hit?.value, expires: 0, inflight });
  return inflight as Promise<T>;
}

/** À appeler après une transaction : la prochaine lecture repart de la chaîne. */
export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
