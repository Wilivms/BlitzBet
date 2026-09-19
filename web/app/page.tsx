"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Leaderboard } from "@/components/Leaderboard";
import { Pocket } from "@/components/Pocket";
import { GAMES } from "@/lib/games";
import { useTable } from "@/lib/useTable";

export default function TablePage() {
  const { state, error } = useTable(800);
  const [joinUrl, setJoinUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ text: string; href?: string }[]>([]);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/play`);
  }, []);

  const say = (text: string, href?: string) =>
    setLog((l) => [{ text, href }, ...l].slice(0, 8));

  async function croupier(action: "open" | "spin") {
    setBusy(action);
    try {
      const r = await fetch("/api/roulette", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (j.error) say(`Erreur : ${j.error}`);
      else if (action === "open") say(`Nouveau tour ouvert — les mises sont acceptées`, j.explorer);
      else say(`La bille tombe sur le ${j.result}`, j.explorer);
    } catch (e) {
      say(`Erreur : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const wheel = state?.roulette;
  const totalChips = useMemo(
    () => state?.players.reduce((a, p) => a + Number(p.chips), 0) ?? 0,
    [state],
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight">
            Blitz<span className="gold">Bet</span>
          </h1>
          <p className="opacity-70 text-sm mt-1">
            Casino on-chain sur Monad testnet — le public mise depuis son téléphone, sans wallet.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider opacity-55">Bankroll de la maison</div>
          <div className="text-3xl font-bold gold tabular-nums">
            {state ? Number(state.bankroll).toFixed(2) : "—"} <span className="text-lg">MON</span>
          </div>
          <div className="text-xs opacity-55 mt-0.5">
            {totalChips.toFixed(2)} MON en jetons sur la table
          </div>
        </div>
      </header>

      {error && (
        <div className="felt-card p-4 mb-6 border-rose-500/40 text-rose-200 text-sm">
          {error}
          <div className="opacity-70 mt-1">
            Vérifie que <code>web/.env.local</code> contient bien les adresses de contrats.
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ------------------------------------------------------------- roulette -- */}
        <section className="felt-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold">
              Roulette <span className="opacity-50 text-sm font-normal">européenne, zéro unique</span>
            </h2>
            <span className="text-xs opacity-60">
              Tour #{wheel?.roundId ?? "—"}
              {wheel?.isOpen ? (
                <span className="ml-2 text-emerald-400 pulsing">● mises ouvertes</span>
              ) : (
                <span className="ml-2 opacity-50">● fermé</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Dernier tirage</div>
              <Pocket n={wheel?.lastResult ?? 0} />
            </div>
            <div className="flex-1">
              <div className="text-sm opacity-70 mb-3">
                {wheel?.betsInRound ?? 0} mise(s) sur le tapis pour ce tour.
              </div>
              <div className="flex gap-3">
                <button
                  className="btn"
                  disabled={busy !== null || wheel?.isOpen}
                  onClick={() => croupier("open")}
                >
                  {busy === "open" ? "…" : "Ouvrir un tour"}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy !== null || !wheel?.isOpen}
                  onClick={() => croupier("spin")}
                >
                  {busy === "spin" ? "La bille tourne…" : "Lancer la bille"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-4 space-y-1 text-sm">
            {log.length === 0 && <p className="opacity-40">Le journal du croupier s’affichera ici.</p>}
            {log.map((l, i) => (
              <p key={i} className="opacity-80">
                {l.href ? (
                  <a className="underline decoration-dotted" href={l.href} target="_blank" rel="noreferrer">
                    {l.text}
                  </a>
                ) : (
                  l.text
                )}
              </p>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------------ QR -- */}
        <section className="felt-card p-6 flex flex-col items-center justify-center text-center">
          <h2 className="text-lg font-bold mb-1">Rejoindre la table</h2>
          <p className="text-xs opacity-60 mb-4">
            Scannez, choisissez un pseudo, la maison vous offre vos jetons.
          </p>
          {joinUrl && (
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={joinUrl} size={168} />
            </div>
          )}
          <code className="text-[11px] opacity-50 mt-3 break-all">{joinUrl}</code>
        </section>

        {/* --------------------------------------------------------- leaderboard -- */}
        <section className="felt-card p-6 lg:col-span-2">
          <h2 className="text-xl font-bold mb-4">Classement</h2>
          <Leaderboard players={state?.players ?? []} />
        </section>

        {/* ---------------------------------------------------------- game menu -- */}
        <section className="felt-card p-6">
          <h2 className="text-xl font-bold mb-4">Les jeux</h2>
          <ul className="space-y-3">
            {GAMES.map((g) => (
              <li key={g.key} className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs opacity-60">{g.tagline}</div>
                </div>
                <span
                  className={`shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2 py-1 ${
                    g.status === "live"
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30"
                      : "bg-amber-500/10 text-amber-300/80 ring-1 ring-amber-400/25"
                  }`}
                >
                  {g.status === "live" ? "jouable" : "roadmap"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] opacity-45 mt-4 leading-relaxed">
            Blackjack et Aviator sont des prototypes non déployés : ils apparaissent ici pour la
            feuille de route, pas comme des jeux jouables.
          </p>
        </section>
      </div>
    </main>
  );
}
