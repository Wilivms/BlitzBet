"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { GameCard } from "@/components/GameCard";
import { Leaderboard } from "@/components/Leaderboard";
import { Pocket } from "@/components/Pocket";
import { useAviator } from "@/lib/useAviator";
import { useTable } from "@/lib/useTable";

/** Écran de table : ce que le public voit sur le grand écran. */
export default function TablePage() {
  const { state, error } = useTable(900);
  const av = useAviator(450);
  const [joinUrl, setJoinUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/play`);
  }, []);

  async function call(endpoint: string, body: Record<string, unknown>) {
    setBusy(String(body.action));
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } finally {
      setBusy(null);
    }
  }

  const wheel = state?.roulette;
  const phase = av?.phase ?? "idle";
  const flying = phase === "flying";

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Blitz<span className="accent">Bet</span>
          </h1>
          <p className="text-sm muted mt-1">
            Casino on-chain sur Monad testnet. Scannez, misez, sans wallet.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest muted">Bankroll</div>
          <div className="text-2xl font-semibold tabular">
            {state ? Number(state.bankroll).toFixed(2) : "—"}
            <span className="text-sm muted ml-1.5">MON</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="card p-4 mb-8 text-sm" style={{ borderColor: "rgba(160,5,93,.5)" }}>
          <span style={{ color: "#f0709f" }}>{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        <GameCard
          name="Aviator"
          tagline="Le multiplicateur monte d’un cran par bloc Monad."
          live={flying || phase === "betting"}
          status={
            phase === "betting" ? "mises ouvertes" : flying ? "en vol" : phase === "settled" ? "crashé" : "au sol"
          }
        >
          <div className="text-center py-3">
            <div
              className="text-5xl font-bold tabular"
              style={{ color: flying ? "var(--purple)" : phase === "settled" ? "#f0709f" : "var(--faint)" }}
            >
              {(flying ? av!.multiplier : phase === "settled" ? (av?.lastCrash ?? 1) : 1).toFixed(2)}×
            </div>
            <div className="text-xs muted mt-1">
              {flying ? `${av!.tick} blocs de vol` : phase === "settled" ? "crashé" : "prêt au décollage"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn"
              disabled={busy !== null || phase === "betting" || flying}
              onClick={() => call("/api/aviator", { action: "open" })}
            >
              Ouvrir
            </button>
            <button
              className="btn btn-primary"
              disabled={busy !== null || phase !== "betting"}
              onClick={() => call("/api/aviator", { action: "launch" })}
            >
              Décoller
            </button>
          </div>
        </GameCard>

        <GameCard
          name="Roulette"
          tagline="Européenne à zéro unique. Toute la table sur la même roue."
          live={Boolean(wheel?.isOpen)}
          status={wheel?.isOpen ? "mises ouvertes" : "fermé"}
        >
          <div className="flex items-center gap-4 py-3">
            <Pocket n={wheel?.lastResult ?? 0} />
            <div className="text-xs muted">
              Tour #{wheel?.roundId ?? "—"}
              <br />
              {wheel?.betsInRound ?? 0} mise(s) sur le tapis
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn"
              disabled={busy !== null || wheel?.isOpen}
              onClick={() => call("/api/roulette", { action: "open" })}
            >
              Ouvrir un tour
            </button>
            <button
              className="btn btn-primary"
              disabled={busy !== null || !wheel?.isOpen}
              onClick={() => call("/api/roulette", { action: "spin" })}
            >
              Lancer
            </button>
          </div>
        </GameCard>

        <GameCard
          name="CoinFlip"
          tagline="Pile ou face, double ou rien. Les joueurs misent depuis leur téléphone."
          live
          status="en ligne"
          meta="2× · résultat en une transaction"
        />

        <GameCard
          name="Blackjack"
          tagline="Chaque joueur affronte le contrat. Tirer, rester, doubler, séparer."
          live
          status="en ligne"
          meta="blackjack payé 3:2 · croupier à 17"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="card p-5 sm:col-span-2">
          <h2 className="font-semibold mb-4">Classement</h2>
          <Leaderboard players={state?.players ?? []} />
        </section>

        <section className="card p-5 flex flex-col items-center justify-center text-center">
          <h2 className="font-semibold mb-1">Rejoindre</h2>
          <p className="text-xs muted mb-4">La maison offre les jetons.</p>
          {joinUrl && (
            <div className="bg-white p-2.5 rounded-xl">
              <QRCodeSVG value={joinUrl} size={132} />
            </div>
          )}
        </section>
      </div>

      <footer className="mt-10 text-[11px] muted text-center">
        Monad testnet · chain 10143 · les quatre jeux tournent on-chain
      </footer>
    </main>
  );
}
