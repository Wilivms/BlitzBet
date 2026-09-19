"use client";

type Props = {
  name: string;
  tagline: string;
  meta?: string;
  live?: boolean;
  status?: string;
  onClick?: () => void;
  children?: React.ReactNode;
};

/** Une tuile de jeu. Même langage visuel sur l'écran de table et sur le téléphone. */
export function GameCard({ name, tagline, meta, live, status, onClick, children }: Props) {
  return (
    <div
      className={`card p-5 flex flex-col ${onClick ? "card-hover" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-semibold text-lg">{name}</h3>
        <span className="flex items-center gap-1.5 text-[11px] muted shrink-0 mt-1">
          <span className={`dot ${live ? "dot-live" : "dot-idle"}`} />
          {status ?? (live ? "en ligne" : "au repos")}
        </span>
      </div>
      <p className="text-sm muted">{tagline}</p>
      {meta && <p className="text-xs accent mt-2 tabular">{meta}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
