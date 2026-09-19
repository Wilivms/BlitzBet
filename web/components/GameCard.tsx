"use client";

const ICONS: Record<string, string> = {
  Aviator: "\u2708\ufe0f",
  Roulette: "\ud83c\udfa1",
  CoinFlip: "\ud83e\ude99",
  Blackjack: "\ud83c\udccf",
};

type Props = {
  name: string;
  tagline: string;
  meta?: string;
  live?: boolean;
  status?: string;
  onClick?: () => void;
  children?: React.ReactNode;
};

export function GameCard({ name, tagline, meta, live, status, onClick, children }: Props) {
  return (
    <div
      className={`card p-6 flex flex-col ${onClick ? "card-hover" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{ICONS[name] ?? "\ud83c\udfb2"}</span>
          <h3 className="font-extrabold text-2xl tracking-tight">{name}</h3>
        </div>
        <span className={`chip shrink-0 ${live ? "chip-live" : ""}`}>
          <span className={`dot ${live ? "dot-live" : "dot-idle"}`} />
          {status ?? (live ? "en ligne" : "au repos")}
        </span>
      </div>
      <p className="text-sm muted leading-relaxed">{tagline}</p>
      {meta && <p className="text-xs accent mt-2.5 tabular font-semibold">{meta}</p>}
      {children && <div className="mt-5">{children}</div>}
      {onClick && (
        <div className="mt-5 flex items-center gap-1.5 text-sm font-bold accent">
          Jouer <span aria-hidden>&rarr;</span>
        </div>
      )}
    </div>
  );
}
