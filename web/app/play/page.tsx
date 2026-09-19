"use client";

import { useEffect, useState } from "react";
import { Pocket } from "@/components/Pocket";
import { BET_TYPES } from "@/lib/games";
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
  const [betType, setBetType] = useState(1);
  const [betValue, setBetValue] = useState(0);

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
        setMsg({ text: `Bienvenue ${j.nickname}, bonne chance.`, tone: "info" });
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
      if (j.error) setMsg({ text: j.error, tone: "lose" });
      else {
        const face = j.result === 0 ? "pile" : "face";
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
      else setMsg({ text: "Mise sur le tapis. Attendez le lancer.", tone: "info", href: j.explorer });
    } catch (e) {
      setMsg({ text: (e as Error).message, tone: "lose" });
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ join view --
  if (!seatId) {
    return (
      <main className="mx-auto max-w-md px-5 py-12">
        <h1 className="text-4xl font-black text-center mb-2">
          Blitz<span className="gold">Bet</span>
        </h1>
        <p className="text-center text-sm opacity-65 mb-8">
          Pas de wallet, pas de clé. La maison vous offre vos jetons et signe vos mises.
        </p>
        <div className="felt-card p-6 space-y-4">
          <label className="block text-sm opacity-75">Votre pseudo</label>
          <input
            className="chip-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Tim"
            maxLength={24}
          />
          <button className="btn btn-primary w-full" disabled={busy} onClick={join}>
            {busy ? "…" : "S’asseoir à la table"}
          </button>
          {msg && <p className="text-sm opacity-80">{msg.text}</p>}
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------ play view --
  const tone =
    msg?.tone === "win" ? "text-emerald-300" : msg?.tone === "lose" ? "text-rose-300" : "opacity-80";

  return (
    <main className="mx-auto max-w-md px-5 py-8 pb-24">
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-55">Joueur</div>
          <div className="text-xl font-bold">{me?.nickname ?? "…"}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider opacity-55">Jetons</div>
          <div className="text-2xl font-bold gold tabular-nums">
            {me ? Number(me.chips).toFixed(3) : "—"}
          </div>
        </div>
      </header>

      {msg && (
        <div className={`felt-card p-4 mb-5 text-sm ${tone}`}>
          {msg.href ? (
            <a href={msg.href} target="_blank" rel="noreferrer" className="underline decoration-dotted">
              {msg.text}
            </a>
          ) : (
            msg.text
          )}
        </div>
      )}

      <section className="felt-card p-5 mb-5">
        <div className="text-xs uppercase tracking-wider opacity-55 mb-2">Mise</div>
        <div className="grid grid-cols-4 gap-2">
          {STAKES.map((s) => (
            <button
              key={s}
              onClick={() => setStake(s)}
              className={`btn text-sm ${stake === s ? "btn-primary" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="felt-card p-5 mb-5">
        <h2 className="font-bold mb-1">CoinFlip</h2>
        <p className="text-xs opacity-60 mb-4">Double ou rien, résultat immédiat.</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn" disabled={busy} onClick={() => flip(0)}>
            Pile
          </button>
          <button className="btn" disabled={busy} onClick={() => flip(1)}>
            Face
          </button>
        </div>
      </section>

      <section className="felt-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold">Roulette</h2>
          <span className="text-xs">
            {wheel?.isOpen ? (
              <span className="text-emerald-400 pulsing">● mises ouvertes</span>
            ) : (
              <span className="opacity-50">● tour fermé</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs opacity-60">Dernier tirage</span>
          <Pocket n={wheel?.lastResult ?? 0} size="sm" />
        </div>

        <select
          className="chip-input mb-3"
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
            className="chip-input mb-3"
            value={betValue}
            onChange={(e) => setBetValue(Math.max(0, Math.min(36, Number(e.target.value))))}
            placeholder="Numéro 0-36"
          />
        )}
        {betType === 7 && (
          <select
            className="chip-input mb-3"
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
          {wheel?.isOpen ? "Miser" : "En attente du croupier"}
        </button>
      </section>
    </main>
  );
}
