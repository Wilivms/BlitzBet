const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** Cards are drawn from an infinite shoe, so the chain stores a rank and no suit. */
export function Card({ rank, index = 0 }: { rank: number; index?: number }) {
  return (
    <span
      className="card-deal inline-flex h-14 w-10 items-center justify-center rounded-lg bg-[#fbfaf9] text-[#0e100f] font-semibold text-lg"
      style={{ animationDelay: `${index * 110}ms` }}
    >
      {RANKS[rank] ?? "?"}
    </span>
  );
}

export function CardRow({ cards, total }: { cards: number[]; total?: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {cards.map((c, i) => (
        // La clé inclut le rang : une nouvelle carte remonte l'animation, les anciennes non.
        <Card key={`${i}-${c}`} rank={c} index={i} />
      ))}
      {total !== undefined && <span className="ml-2 text-sm muted tabular">{total}</span>}
    </div>
  );
}
