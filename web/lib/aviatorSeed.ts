import "server-only";
import { randomBytes } from "crypto";
import { keccak256, toHex } from "viem";

/**
 * The crash point lives in the seed, so the seed has to stay secret until the reveal --
 * otherwise anyone could read it and cash out one block early, every round.
 *
 * It is held in process memory, never sent to a client and never written to disk. A server
 * restart mid-round loses it, which is exactly why Aviator.abortRound() exists: the table
 * gets its stakes back rather than the house keeping chips it can no longer settle.
 */
const seeds = new Map<number, `0x${string}`>();

export function mintSeed(roundId: number) {
  const seed = toHex(randomBytes(32));
  seeds.set(roundId, seed);
  // Only ever need the round in flight plus a little history for debugging.
  for (const k of seeds.keys()) if (k < roundId - 3) seeds.delete(k);
  return { seed, commitment: keccak256(seed) };
}

export function seedFor(roundId: number) {
  return seeds.get(roundId) ?? null;
}
