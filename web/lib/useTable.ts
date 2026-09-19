"use client";
import { useEffect, useState } from "react";

export type TableState = {
  bankroll: string;
  players: {
    seatId: string;
    nickname: string;
    chips: string;
    pnl: string;
    pnlRaw: string;
    bets: number;
  }[];
  roulette: { roundId: number; isOpen: boolean; lastResult: number; betsInRound: number };
};

/** Polls the chain-backed table state. 800ms keeps the leaderboard feeling live on 300ms blocks. */
export function useTable(intervalMs = 2500) {
  const [state, setState] = useState<TableState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (j.error) setError(j.error);
        else {
          setError(null);
          setState(j);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { state, error };
}
