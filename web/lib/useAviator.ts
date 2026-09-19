"use client";
import { useEffect, useState } from "react";

export type AviatorState = {
  roundId: number;
  phase: "idle" | "betting" | "flying" | "settled";
  tick: number;
  multiplier: number;
  lastCrash: number;
  seats: { seatId: string; wager: string; cashedOut: boolean; cashOutTick: number; payout: string }[];
  error?: string;
};

/** 400ms polling. Blocks are 300ms, so this is roughly one sample per tick of the curve. */
export function useAviator(intervalMs = 1000) {
  const [state, setState] = useState<AviatorState | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/aviator", { cache: "no-store" });
        const j = await r.json();
        if (alive) setState(j);
      } catch {
        /* keep the last frame rather than blanking the table */
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return state;
}
