"use client";
import { useState } from "react";
import { useAviator } from "@/lib/useAviator";
import { Sky } from "./Sky";
import { toCredits } from "@/lib/credits";

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/aviator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export function AviatorPanel({
  mode,
  seatId,
  stake,
}: {
  mode: "table" | "player";
  seatId?: string;
  stake?: string;
}) {
  const av = useAviator(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const phase = av?.phase ?? "idle";
  const flying = phase === "flying";
  const mine = seatId ? av?.seats.find((s) => s.seatId.toLowerCase() === seatId.toLowerCase()) : undefined;

  async function act(action: string) {
    setBusy(true);
    setMsg(null);
    const j = await post({ action, seatId, wager: stake });
    if (j.error) setMsg(j.error);
    else if (action === "cashout") setMsg(`Encaissé au tick ${j.tick}.`);
    setBusy(false);
  }

  // The multiplier is a function of block height, so it steps rather than glides. That is
  // the point, and the UI shows the tick count next to it to make it obvious.
  const shown = flying ? av!.multiplier : phase === "settled" ? (av?.lastCrash ?? 1) : 1;
    const colourStyle = {
    color: flying ? "var(--purple)" : phase === "settled" ? "#f0709f" : "var(--faint)",
  };

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold">Aviator</h2>
        <span className="text-xs muted">
          Tour #{av?.roundId ?? "—"} ·{" "}
          {phase === "betting" ? (
            <span className="pulsing" style={{ color: "#4ade80" }}>mises ouvertes</span>
          ) : flying ? (
            <span className="pulsing" style={{ color: "var(--purple)" }}>en vol</span>
          ) : phase === "settled" ? (
            <span style={{ color: "#f0709f" }}>crashé</span>
          ) : (
            <span className="muted">au sol</span>
          )}
        </span>
      </div>
      <p className="text-xs muted mb-4">
        Le multiplicateur avance d’un cran par bloc Monad (~300 ms). Point de crash engagé
        avant la première mise.
      </p>

      <Sky multiplier={shown} flying={flying} crashed={phase === "settled"} />

      <div className="text-center py-4">
        <div className="text-6xl font-bold tabular" style={colourStyle}>
          {shown.toFixed(2)}×
        </div>
        <div className="text-xs muted mt-1">
          {flying ? `${av!.tick} blocs de vol` : phase === "settled" ? "crashé à ce multiplicateur" : "prêt"}
        </div>
      </div>

      {msg && <p className="text-sm text-amber-300 mb-3">{msg}</p>}

      {mode === "table" ? (
        <div className="grid grid-cols-3 gap-2">
          <button className="btn text-sm" disabled={busy || phase === "betting" || flying} onClick={() => act("open")}>
            Ouvrir
          </button>
          <button className="btn btn-primary text-sm" disabled={busy || phase !== "betting"} onClick={() => act("launch")}>
            Décoller
          </button>
          <button className="btn text-sm" disabled={busy || (phase !== "betting" && !flying)} onClick={() => act("abort")}>
            Annuler
          </button>
        </div>
      ) : (
        <>
          {!mine && (
            <button
              className="btn btn-primary w-full"
              disabled={busy || phase !== "betting"}
              onClick={() => act("bet")}
            >
              {phase === "betting" ? `Miser ${toCredits(stake ?? "0")} crédits` : "En attente du prochain tour"}
            </button>
          )}
          {mine && !mine.cashedOut && (
            <button className="btn btn-primary w-full" disabled={busy || !flying} onClick={() => act("cashout")}>
              {flying ? `Encaisser à ${av!.multiplier.toFixed(2)}×` : "En attente du décollage"}
            </button>
          )}
          {mine?.cashedOut && (
            <p className="text-sm text-center">
              Encaissé au tick {mine.cashOutTick}.{" "}
              {phase === "settled" &&
                (Number(mine.payout) > 0 ? (
                  <span className="text-emerald-300">Gagné {Number(mine.payout).toFixed(3)} MON.</span>
                ) : (
                  <span className="text-rose-300">Trop tard, l’avion était déjà parti.</span>
                ))}
            </p>
          )}
        </>
      )}

      <div className="mt-4 border-t border-white/10 pt-3 space-y-1 text-xs">
        {av?.seats.length === 0 && <p className="muted">Personne à bord.</p>}
        {av?.seats.map((s) => (
          <div key={s.seatId} className="flex justify-between muted">
            <span className="font-mono">{s.seatId.slice(2, 8)}</span>
            <span>
              {s.wager} MON
              {s.cashedOut ? ` · sorti au tick ${s.cashOutTick}` : " · encore à bord"}
              {Number(s.payout) > 0 && ` · +${Number(s.payout).toFixed(3)}`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
