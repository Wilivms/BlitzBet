"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Leaderboard } from "@/components/Leaderboard";
import { WalletBar } from "@/components/WalletBar";
import { GAMES } from "@/lib/games";
import { useTable } from "@/lib/useTable";

const ICONS: Record<string, string> = {
  aviator: "✈︎", roulette: "◉", coinflip: "◐", blackjack: "♠",
};

/** Accueil : les quatre jeux, rien d'autre. Un clic mène à la page du jeu. */
export default function Home() {
  const { state, error } = useTable(2500);
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => setJoinUrl(`${window.location.origin}/play`), []);

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="title-xl">BlitzBet</h1>
          <p className="text-sm muted mt-2">Casino on-chain sur Monad testnet.</p>
        </div>
        <div className="text-right">
          <div className="eyebrow mb-1.5">Bankroll</div>
          <div className="figure text-2xl">
            {state ? Number(state.bankroll).toFixed(2) : "—"}
            <span className="text-sm muted ml-1.5 font-normal">MON</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="card p-4 mb-8 text-sm" style={{ color: "var(--berry)" }}>{error}</div>
      )}

      <div className="grid gap-px mb-12 overflow-hidden rounded-2xl" style={{ background: "var(--line)" }}>
        {GAMES.map((g) => (
          <Link key={g.key} href={`/play/${g.key}`} className="game-row">
            <span className="game-icon">{ICONS[g.key]}</span>
            <span className="game-name">{g.name}</span>
            <span className="game-arrow" aria-hidden>→</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <section className="card p-6 sm:col-span-2">
          <h2 className="eyebrow mb-4">Classement</h2>
          <Leaderboard players={state?.players ?? []} />
        </section>

        <section className="card p-6 flex flex-col items-center justify-center text-center">
          <h2 className="eyebrow mb-3">Rejoindre</h2>
          {joinUrl && (
            <div className="bg-white p-2.5 rounded-lg">
              <QRCodeSVG value={joinUrl} size={124} />
            </div>
          )}
        </section>
      </div>

      <WalletBar />

      <footer className="mt-10 text-[11px] muted text-center">
        Monad testnet · chain 10143
      </footer>
    </main>
  );
}
