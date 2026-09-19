"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GAMES } from "@/lib/games";
import { fmtCredits } from "@/lib/credits";
import { useTable } from "@/lib/useTable";

const SEAT_KEY = "blitzbet.seat";
const ICONS: Record<string, string> = {
  aviator: "✈️", roulette: "🎡", coinflip: "🪙", blackjack: "🃏",
};

export default function PlayMenu() {
  const { state } = useTable(3000);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setSeatId(localStorage.getItem(SEAT_KEY)), []);
  const me = state?.players.find((p) => p.seatId === seatId);

  async function join() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const j = await r.json();
      if (j.error) setErr(j.error);
      else { localStorage.setItem(SEAT_KEY, j.seatId); setSeatId(j.seatId); }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!seatId) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="title-xl text-center">BlitzBet</h1>
        <p className="text-center text-sm muted mt-3 mb-8">
          Pas de wallet, pas de clé. La maison vous offre 500 crédits.
        </p>
        <div className="card p-6 space-y-4">
          <label className="eyebrow block">Pseudo</label>
          <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)}
                 placeholder="Votre nom" maxLength={24} />
          <button className="btn btn-primary w-full" disabled={busy} onClick={join}>
            {busy ? "…" : "S'asseoir à la table"}
          </button>
          {err && <p className="text-sm" style={{ color: "var(--berry)" }}>{err}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-10 pb-20">
      <header className="flex items-end justify-between mb-8">
        <div>
          <div className="eyebrow mb-1.5">Joueur</div>
          <div className="text-xl font-extrabold">{me?.nickname ?? "…"}</div>
        </div>
        <div className="text-right">
          <div className="eyebrow mb-1.5">Crédits</div>
          <div className="credits">
            <span className="credits-value">{me ? fmtCredits(me.chips) : "—"}</span>
          </div>
        </div>
      </header>

      <h2 className="eyebrow mb-4">Choisissez un jeu</h2>
      <div className="grid gap-3.5">
        {GAMES.map((g) => (
          <Link key={g.key} href={`/play/${g.key}`} className="card card-hover p-5 flex items-center gap-4">
            <span className="text-3xl leading-none">{ICONS[g.key]}</span>
            <span className="font-extrabold text-xl tracking-tight flex-1">{g.name}</span>
            <span className="text-2xl accent" aria-hidden>→</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
