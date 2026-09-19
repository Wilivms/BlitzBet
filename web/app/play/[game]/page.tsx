"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AviatorPanel } from "@/components/AviatorPanel";
import { BlackjackPanel } from "@/components/BlackjackPanel";
import { Coin } from "@/components/Coin";
import { Wheel } from "@/components/Wheel";
import { BET_TYPES, GAMES, type GameKey } from "@/lib/games";
import { fmtCredits, toCredits } from "@/lib/credits";
import { useTable } from "@/lib/useTable";

const SEAT_KEY = "blitzbet.seat";
const STAKES = ["0.005", "0.01", "0.02", "0.05"];
const VALID: GameKey[] = ["coinflip", "roulette", "blackjack", "aviator"];

export default function GamePage() {
  const params = useParams<{ game: string }>();
  const game = params.game as GameKey;

  const { state } = useTable(1200);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [stake, setStake] = useState("0.01");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "win" | "lose" | "info"; href?: string } | null>(null);
  const [betType, setBetType] = useState(1);
  const [betValue, setBetValue] = useState(0);
  const [flipResult, setFlipResult] = useState<0 | 1 | null>(null);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => setSeatId(localStorage.getItem(SEAT_KEY)), []);

  const me = state?.players.find((p) => p.seatId === seatId);
  const wheel = state?.roulette;
  const meta = GAMES.find((g) => g.key === game);

  async function flip(choice: 0 | 1) {
    setBusy(true); setFlipping(true); setFlipResult(null);
    setMsg({ text: "La pièce est en l'air…", tone: "info" });
    try {
      const r = await fetch("/api/coinflip", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ seatId, wager: stake, choice }),
      });
      const j = await r.json();
      setFlipping(false);
      if (j.error) setMsg({ text: j.error, tone: "lose" });
      else {
        setFlipResult(j.result === 0 ? 0 : 1);
        const face = j.result === 0 ? "Pile" : "Face";
        setMsg({
          text: j.won ? `${face} — gagné, mise doublée.` : `${face} — perdu.`,
          tone: j.won ? "win" : "lose", href: j.explorer,
        });
      }
    } catch (e) { setFlipping(false); setMsg({ text: (e as Error).message, tone: "lose" }); }
    finally { setBusy(false); }
  }

  async function placeRouletteBet() {
    setBusy(true); setMsg({ text: "Mise en cours…", tone: "info" });
    try {
      const r = await fetch("/api/roulette", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "bet", seatId, wager: stake, betType, value: betValue }),
      });
      const j = await r.json();
      if (j.error) setMsg({ text: j.error, tone: "lose" });
      else setMsg({ text: "Mise placée. Attendez le lancer.", tone: "info", href: j.explorer });
    } catch (e) { setMsg({ text: (e as Error).message, tone: "lose" }); }
    finally { setBusy(false); }
  }

  if (!VALID.includes(game)) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16 text-center">
        <p className="muted mb-4">Ce jeu n&apos;existe pas.</p>
        <Link href="/play" className="btn btn-primary">Retour aux jeux</Link>
      </main>
    );
  }

  if (!seatId) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16 text-center">
        <p className="muted mb-4">Asseyez-vous d&apos;abord à la table.</p>
        <Link href="/play" className="btn btn-primary">Rejoindre</Link>
      </main>
    );
  }

  const tone = msg?.tone === "win" ? "var(--green)" : msg?.tone === "lose" ? "var(--berry)" : "var(--muted)";

  return (
    <main className="mx-auto max-w-sm px-5 py-8 pb-20">
      <Link href="/play" className="text-sm muted inline-flex items-center gap-1.5 mb-5">
        ← Tous les jeux
      </Link>

      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="eyebrow mb-1.5">{meta?.name}</div>
          <div className="text-lg font-bold">{me?.nickname ?? "…"}</div>
        </div>
        <div className="text-right">
          <div className="eyebrow mb-1.5">Crédits</div>
          <div className="credits"><span className="credits-value">{me ? fmtCredits(me.chips) : "—"}</span></div>
        </div>
      </header>

      {msg && (
        <div className="card p-3.5 mb-5 text-sm" style={{ color: tone }}>
          {msg.href
            ? <a href={msg.href} target="_blank" rel="noreferrer" className="underline decoration-dotted">{msg.text}</a>
            : msg.text}
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="eyebrow mb-2.5">Mise (crédits)</div>
        <div className="grid grid-cols-4 gap-2">
          {STAKES.map((s) => (
            <button key={s} onClick={() => setStake(s)}
                    className={`btn text-sm ${stake === s ? "btn-primary" : ""}`}>
              {toCredits(s)}
            </button>
          ))}
        </div>
      </div>

      {game === "coinflip" && (
        <section className="card p-5">
          <h2 className="font-extrabold text-xl mb-1">CoinFlip</h2>
          <p className="text-xs muted mb-4">Double ou rien, résultat immédiat.</p>
          <Coin result={flipResult} spinning={flipping} />
          <div className="h-4" />
          <div className="grid grid-cols-2 gap-3">
            <button className="btn" disabled={busy} onClick={() => flip(0)}>Pile</button>
            <button className="btn btn-hot" disabled={busy} onClick={() => flip(1)}>Face</button>
          </div>
        </section>
      )}

      {game === "roulette" && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-xl">Roulette</h2>
            <span className={`chip ${wheel?.isOpen ? "chip-live" : ""}`}>
              <span className={`dot ${wheel?.isOpen ? "dot-live" : "dot-idle"}`} />
              {wheel?.isOpen ? "mises ouvertes" : "tour fermé"}
            </span>
          </div>
          <Wheel result={wheel?.lastResult ?? null} spinning={Boolean(wheel?.isOpen)} />
          <p className="text-center text-xs muted mb-4 mt-3">
            {wheel?.isOpen ? "la roue tourne — misez" : "dernier tirage"}
          </p>
          <select className="input mb-3" value={betType}
                  onChange={(e) => { setBetType(Number(e.target.value)); setBetValue(0); }}>
            {BET_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label} — {b.odds}</option>)}
          </select>
          {betType === 0 && (
            <input type="number" min={0} max={36} className="input mb-3" value={betValue}
                   onChange={(e) => setBetValue(Math.max(0, Math.min(36, Number(e.target.value))))} />
          )}
          {betType === 7 && (
            <select className="input mb-3" value={betValue} onChange={(e) => setBetValue(Number(e.target.value))}>
              <option value={0}>1re douzaine (1-12)</option>
              <option value={1}>2e douzaine (13-24)</option>
              <option value={2}>3e douzaine (25-36)</option>
            </select>
          )}
          <button className="btn btn-primary w-full" disabled={busy || !wheel?.isOpen} onClick={placeRouletteBet}>
            {wheel?.isOpen ? `Miser ${toCredits(stake)} crédits` : "En attente du croupier"}
          </button>
        </section>
      )}

      {game === "blackjack" && <BlackjackPanel seatId={seatId} stake={stake} />}
      {game === "aviator" && <AviatorPanel mode="player" seatId={seatId} stake={stake} />}
    </main>
  );
}
