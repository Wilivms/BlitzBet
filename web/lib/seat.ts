import { keccak256, toHex } from "viem";
import { randomBytes } from "crypto";

/**
 * A seat is just a bytes32 handed to a spectator when they scan the QR code. It lives in
 * their browser's localStorage; the chain holds the nickname, the chips and the P&L, so the
 * server keeps no session state and a restart loses nothing.
 */
export function newSeatId(): `0x${string}` {
  return keccak256(toHex(randomBytes(32)));
}

export function isSeatId(v: unknown): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

export function cleanNickname(v: unknown): string {
  const s = typeof v === "string" ? v.trim().slice(0, 24) : "";
  return s.replace(/[^\p{L}\p{N} _.\-]/gu, "") || "Anon";
}
