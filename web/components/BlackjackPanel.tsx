"use client";
import { useEffect, useState } from "react";
import { CardRow } from "./Card";

type Hand = {
  cards: number[];
  total: number;
  soft: boolean;
  wager: string;
  doubled: boolean;
  state: string;
  payout: string;
};
type Game = {
  gameId: number;
  hands: Hand[];
  dealer: { cards: number[]; total: number };
  activeHand: number;
  finished: boolean;
  wasSplit: boolean;
  explorer?: string;
  error?: string;
};

export function BlackjackPanel({ seatId, stake }: { seatId: string; stake: string }) {
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Pick an unfinished hand back up if the phone was locked mid-game.
  useEffect(() => {
    fetch(`/api/blackjack?seatId=${seatId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.gameId) setGame(j);
      })
      .catch(() => undefined);
  }, [seatId]);

  async function act(action: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/blackjack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, seatId, wager: stake }),
      });
      const j: Game = await r.json();
      if (j.error) setMsg(j.error);
      else setGame(j);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const live = game && !game.finished;
  const hand = live ? game.hands[game.activeHand] : null;
  const canSplit =
    !!hand &&
    !game?.wasSplit &&
    game?.hands.length === 1 &&
    hand.cards.length === 2 &&
    Math.min(hand.cards[0], 10) === Math.min(hand.cards[1], 10);
  const canDouble = !!hand && hand.cards.length === 2 && !hand.doubled;

  const won = game?.finished
    ? game.hands.reduce((a, h) => a + Number(h.payout) - Number(h.wager), 0)
    : 0;

  return (
    <section className="felt-card p-5">
      <h2 className="font-bold mb-1">Blackjack</h2>
      <p className="text-xs opacity-60 mb-4">
        Le croupier tire jusqu’à 17. Blackjack payé 3:2.
      </p>

      {msg && <p className="text-sm text-rose-300 mb-3">{msg}</p>}

      {game && game.gameId > 0 && (
        <div className="space-y-4 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider opacity-55 mb-1.5">Croupier</div>
            <CardRow cards={game.dealer.cards} total={game.finished ? game.dealer.total : undefined} />
          </div>
          {game.hands.map((h, i) => (
            <div key={i} className={i === game.activeHand && live ? "" : "opacity-70"}>
              <div className="text-xs uppercase tracking-wider opacity-55 mb-1.5">
                {game.hands.length > 1 ? `Votre main ${i + 1}` : "Votre main"}
                {h.doubled && " · doublée"}
                {game.finished && ` · ${h.state}`}
              </div>
              <CardRow cards={h.cards} total={h.total} />
            </div>
          ))}
          {game.finished && (
            <p
              className={`text-sm font-semibold ${
                won > 0 ? "text-emerald-300" : won < 0 ? "text-rose-300" : "opacity-70"
              }`}
            >
              {won > 0 ? `Gagné +${won.toFixed(3)} MON` : won < 0 ? `Perdu ${won.toFixed(3)} MON` : "Égalité"}
              {game.explorer && (
                <>
                  {" — "}
                  <a href={game.explorer} target="_blank" rel="noreferrer" className="underline decoration-dotted font-normal">
                    voir la transaction
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {live ? (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn" disabled={busy} onClick={() => act("hit")}>
            Tirer
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => act("stand")}>
            Rester
          </button>
          <button className="btn text-sm" disabled={busy || !canDouble} onClick={() => act("double")}>
            Doubler
          </button>
          <button className="btn text-sm" disabled={busy || !canSplit} onClick={() => act("split")}>
            Séparer
          </button>
        </div>
      ) : (
        <button className="btn btn-primary w-full" disabled={busy} onClick={() => act("deal")}>
          {busy ? "…" : `Distribuer (${stake} MON)`}
        </button>
      )}
    </section>
  );
}
