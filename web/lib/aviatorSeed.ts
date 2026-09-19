import "server-only";
import { randomBytes } from "crypto";
import { keccak256, toHex } from "viem";
import { kv } from "./kv";

/**
 * The crash point lives in the seed, so the seed has to stay secret until the reveal --
 * otherwise anyone could read it and cash out one block early, every round.
 *
 * Stored in Redis rather than process memory: on Vercel, the request that opens a round and
 * the request that later reveals it (or the poller that auto-reveals on crash) can land on
 * different serverless instances, which do not share memory. Redis is the one thing every
 * instance actually sees. A key never leaves Redis unless it is read for the reveal, and
 * it's never sent to a client.
 */
export async function mintSeed(roundId: number) {
  const seed = toHex(randomBytes(32)) as `0x${string}`;
  await kv.set(`aviator:seed:${roundId}`, seed, 3600); // 1h ttl: plenty for one round
  return { seed, commitment: keccak256(seed) };
}

export async function seedFor(roundId: number): Promise<`0x${string}` | null> {
  return (await kv.get(`aviator:seed:${roundId}`)) as `0x${string}` | null;
}
