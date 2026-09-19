"use client";
import type { TableState } from "@/lib/useTable";

const fmt = (v: string) => Number(v).toFixed(3);

export function Leaderboard({ players }: { players: TableState["players"] }) {
  if (!players.length) {
    return <p className="text-sm muted">Aucun joueur à la table. Scannez le QR code pour rejoindre.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase tracking-widest muted">
        <tr>
          <th className="text-left py-2">#</th>
          <th className="text-left">Joueur</th>
          <th className="text-right">Jetons</th>
          <th className="text-right">P&amp;L</th>
          <th className="text-right">Mises</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => {
          const up = BigInt(p.pnlRaw) > 0n;
          const down = BigInt(p.pnlRaw) < 0n;
          return (
            <tr key={p.seatId} className="border-t border-white/5">
              <td className="py-2 accent font-semibold tabular">{i + 1}</td>
              <td className="font-medium">{p.nickname}</td>
              <td className="text-right tabular">{fmt(p.chips)}</td>
              <td
                className={`text-right tabular font-semibold ${
                  up ? "text-emerald-400" : down ? "text-rose-400" : "muted"
                }`}
              >
                {up ? "+" : ""}
                {fmt(p.pnl)}
              </td>
              <td className="text-right tabular muted">{p.bets}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
