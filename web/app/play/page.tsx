"use client";

import { useEffect, useState } from "react";
import { AviatorPanel } from "@/components/AviatorPanel";
import { Coin } from "@/components/Coin";
import { Wheel } from "@/components/Wheel";
import { fmtCredits, toCredits } from "@/lib/credits";
import { BlackjackPanel } from "@/components/BlackjackPanel";
import { GameCard } from "@/components/GameCard";
import { BET_TYPES, GAMES, type GameKey } from "@/lib/games";
import { useTable } from "@/lib/useTable";

const STAKES = ["0.01", "0.05", "0.1", "0.25"];
const SEAT_KEY = "blitzbet.seat";

export default function PlayPage() {
  const { state } = useTable(1000);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "win" | "lose" | "info"; href?: string } | null>(null);
  const [stake, setStake] = useState("0.05");
  const [game, setGame] = useState<GameKey | null>(null);
  const [betType, setBetType] = useState(1);
  const [betValue, setBetValue] = useState(0);
  const [flipResult, setFlipResult] = useState<0 | 1 | null>(null);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    setSeatId(localStorage.getItem(SEAT_KEY));
  }, []);

  const me = state?.players.find((p) => p.seatId === seatId);
  const wheel = state?.roulette;

  async function join() {
    setBusy(true);
    setMsg({ text: "La maison prépare vos jetons…", tone: "info" });
    try {
      const r = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const j = await r.json();
      if (j.error) setMsg({ text: j.error, tone: "lose" });
      else {
        localStorage.setItem(SEAT_KEY, j.seatId);
        setSeatId(j.seatId);
        setMsg(null);
      }
    } catch (e) {
      setMsg({ text: (e as Error).message, tone: "lose" });
    } finally {
      setBusy(false);
    }
  }

  async function flip(choice: 0 | 1) {
    setBusy(true);
    setMsg({ text: "La pièce est en l’air…", tone: "info" });
    try {
      const r = await fetch("/api/coinflip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seatId, wager: stake, choice }),
      });
      const j = await r.json();
      if (j.error) {
        setFlipping(false);
        setMsg({ text: j.error, tone: "lose" });
      } else {
        const face = j.result === 0 ? "Pile" : "Face";
        setFlipping(false);
        setFlipResult(j.result === 0 ? 0 : 1);
        setMsg({
          text: j.won ? `${face} — gagné, mise doublée.` : `${face} — perdu.`,
          tone: j.won ? "win" : "lose",
          href: j.explorer,
        });
      }
    } catch (e) {
      setMsg({ text: (e as Error).message, tone: "lose" });
    } finally {
      setBusy(false);
    }
  }

  async function placeRouletteBet() {
    setBusy(true);
    setMsg({ text: "Mise en cours…", tone: "info" });
    try {
      const r = await fetch("/api/roulette", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "bet", seatId, wager: stake, betType, value: betValue }),
      });
      const j = await r.json();
      if (j.error) setMsg({ text: j.error, tone: "lose" });
      else setMsg({ text: "Mise placée. Attendez le lancer.", tone: "info", href: j.explorer });
    } catch (e) {
      setMsg({ text: (e as Error).message, tone: "lose" });
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ écran d'entrée --
  if (!seatId) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="title-xl text-center">
          <span className="neon">BlitzBet</span>
        </h1>
        <p className="text-center text-sm muted mt-2 mb-8">
          Pas de wallet, pas de clé. La maison vous offre vos jetons.
        </p>
        <div className="card p-5 space-y-3">
          <label className="block text-xs uppercase tracking-widest muted">Pseudo</label>
          <input
            className="input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Votre nom"
            maxLength={24}
          />
          <button className="btn btn-primary w-full" disabled={busy} onClick={join}>
            {busy ? "…" : "S’asseoir à la table"}
          </button>
          {msg && <p className="text-sm muted">{msg.text}</p>}
        </div>
      </main>
    );
  }

  const tone =
    msg?.tone === "win" ? "#4ade80" : msg?.tone === "lose" ? "#f0709f" : "var(--muted)";

  return (
    <main className="mx-auto max-w-sm px-5 py-8 pb-20">
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="eyebrow mb-1.5">Joueur</div>
          <div className="text-lg font-semibold">{me?.nickname ?? "…"}</div>
        </div>
        <div className="text-right">
          <div className="eyebrow mb-1.5">Crédits</div>
          <div className="credits">
            <span className="credits-value">{me ? fmtCredits(me.chips) : "—"}</span>
          </div>
        </div>
      </header>

      {msg && (
        <div className="card p-3.5 mb-5 text-sm" style={{ color: tone }}>
          {msg.href ? (
            <a href={msg.href} target="_blank" rel="noreferrer" className="underline decoration-dotted">
              {msg.text}
            </a>
          ) : (
            msg.text
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- menu des jeux -- */}
      {!game && (
        <div className="grid gap-4">
          {GAMES.map((g) => (
            <GameCard
              key={g.key}
              name={g.name}
              tagline={g.tagline}
              meta={g.meta}
              live
              status="en ligne"
              onClick={() => {
                setGame(g.key);
                setMsg(null);
              }}
            />
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------- un seul jeu -- */}
      {game && (
        <>
          <button className="btn mb-4 text-sm" onClick={() => setGame(null)}>
            ← Tous les jeux
          </button>

          <div className="card p-4 mb-4">
            <div className="eyebrow mb-2.5">Mise (crédits)</div>
            <div className="grid grid-cols-4 gap-2">
              {STAKES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStake(s)}
                  className={`btn text-sm ${stake === s ? "btn-primary" : ""}`}
                >
                  {toCredits(s)}
                </button>
              ))}
            </div>
          </div>

          {game === "coinflip" && (
            <section className="card p-5">
              <h2 className="font-semibold mb-1">CoinFlip</h2>
              <p className="text-xs muted mb-4">Double ou rien, résultat immédiat.</p>
              <Coin result={flipResult} spinning={flipping} />
              <div className="h-3" />
              <div className="grid grid-cols-2 gap-3">
                <button className="btn" disabled={busy} onClick={() => flip(0)}>
                  Pile
                </button>
                <button className="btn" disabled={busy} onClick={() => flip(1)}>
                  Face
                </button>
              </div>
            </section>
          )}

          {game === "roulette" && (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Roulette</h2>
                <span className="text-xs muted flex items-center gap-1.5">
                  <span className={`dot ${wheel?.isOpen ? "dot-live" : "dot-idle"}`} />
                  {wheel?.isOpen ? "mises ouvertes" : "tour fermé"}
                </span>
              </div>
              <Wheel result={wheel?.lastResult ?? null} spinning={Boolean(wheel?.isOpen)} />
              <p className="text-center text-xs muted mb-4 mt-2">
                {wheel?.isOpen ? "la roue tourne — misez" : "dernier tirage"}
              </p>

              <select
                className="input mb-3"
                value={betType}
                onChange={(e) => {
                  setBetType(Number(e.target.value));
                  setBetValue(0);
                }}
              >
                {BET_TYPES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} — {b.odds}
                  </option>
                ))}
              </select>

              {betType === 0 && (
                <input
                  type="number"
                  min={0}
                  max={36}
                  className="input mb-3"
                  value={betValue}
                  onChange={(e) => setBetValue(Math.max(0, Math.min(36, Number(e.target.value))))}
                />
              )}
              {betType === 7 && (
                <select
                  className="input mb-3"
                  value={betValue}
                  onChange={(e) => setBetValue(Number(e.target.value))}
                >
                  <option value={0}>1re douzaine (1-12)</option>
                  <option value={1}>2e douzaine (13-24)</option>
                  <option value={2}>3e douzaine (25-36)</option>
                </select>
              )}

              <button
                className="btn btn-primary w-full"
                disabled={busy || !wheel?.isOpen}
                onClick={placeRouletteBet}
              >
                {wheel?.isOpen ? `Miser ${toCredits(stake)} crédits` : "En attente du croupier"}
              </button>
            </section>
          )}

          {game === "blackjack" && <BlackjackPanel seatId={seatId} stake={stake} />}
          {game === "aviator" && <AviatorPanel mode="player" seatId={seatId} stake={stake} />}
        </>
      )}
    </main>
  );
}
