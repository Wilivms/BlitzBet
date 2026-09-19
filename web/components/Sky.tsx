"use client";

/**
 * multiplier vient de useAviator (dérivé de la hauteur de bloc on-chain).
 * L'avion avance d'un cran par bloc : la position EST le multiplicateur.
 */
export function Sky({
  multiplier,
  flying,
  crashed,
}: {
  multiplier: number;
  flying: boolean;
  crashed: boolean;
}) {
  const progress = Math.min((multiplier - 1) / 3, 1);
  const x = progress * 78;
  const y = progress * 66;

  return (
    <div className={`sky mb-4 ${crashed ? "shake" : ""}`}>
      <div className="sky-grid" />
      <div
        className="trail"
        style={{
          width: `${x + 6}%`,
          transform: `rotate(${-Math.min(progress * 38, 38)}deg)`,
          opacity: crashed ? 0.25 : 1,
        }}
      />
      <div
        className={`plane ${crashed ? "plane-crashed" : ""}`}
        style={
          crashed
            ? { left: `${x}%`, bottom: `${y}%` }
            : { transform: `translate(0,0)`, left: `${x}%`, bottom: `${y}%` }
        }
      >
        ✈️
      </div>
      {!flying && !crashed && (
        <div className="absolute inset-0 flex items-center justify-center text-xs muted">
          prêt au décollage
        </div>
      )}
    </div>
  );
}
