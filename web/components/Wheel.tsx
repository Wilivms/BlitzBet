"use client";
import { useEffect, useState } from "react";
import { pocketColour } from "@/lib/games";

/** Ordre réel d'une roue européenne à zéro unique. */
const ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const STEP = 360 / ORDER.length;

/**
 * result : numéro gagnant renvoyé par le contrat via /api/roulette.
 * La roue décélère jusqu'à placer ce numéro sous le repère.
 */
export function Wheel({ result, spinning }: { result: number | null; spinning: boolean }) {
  const [rot, setRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);

  useEffect(() => {
    if (spinning) {
      setRot((r) => r + 360 * 4);
      setBallRot((r) => r - 360 * 7);
      return;
    }
    if (result === null) return;
    const idx = ORDER.indexOf(result);
    if (idx < 0) return;
    setRot((r) => {
      const base = Math.ceil((r + 1440) / 360) * 360;
      return base - idx * STEP;
    });
    setBallRot((r) => Math.floor((r - 1440) / 360) * 360);
  }, [spinning, result]);

  const shown = result ?? 0;
  const c = pocketColour(shown);
  const colour = c === "green" ? "#10b981" : c === "red" ? "#e11d48" : "var(--white)";

  return (
    <div className="wheel-stage">
      <div className="wheel-marker" />
      <div className="wheel" style={{ transform: `rotate(${rot}deg)` }} />
      <div className="ball" style={{ transform: `rotate(${ballRot}deg)` }} />
      <div className="wheel-hub" style={{ color: spinning ? "var(--faint)" : colour }}>
        {spinning ? "…" : shown}
      </div>
    </div>
  );
}
