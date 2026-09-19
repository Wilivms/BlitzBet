const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** Cards are drawn from an infinite shoe, so the chain stores a rank and no suit. */
export function Card({ rank }: { rank: number }) {
  return (
    <span className="inline-flex h-14 w-10 items-center justify-center rounded-lg bg-[#fbfaf9] text-[#0e100f] font-semibold text-lg">
      {RANKS[rank] ?? "?"}
    </span>
  );
}

export function CardRow({ cards, total }: { cards: number[]; total?: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {cards.map((c, i) => (
        <Card key={i} rank={c} />
      ))}
      {total !== undefined && (
        <span className="ml-2 text-sm muted tabular">{total}</span>
      )}
    </div>
  );
}
