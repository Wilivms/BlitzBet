"use client";
import { useEffect, useState } from "react";

/**
 * result : 0 = Pile, 1 = Face, null = au repos.
 * La valeur vient de /api/coinflip. La pièce tourne puis s'arrête sur cette face.
 */
export function Coin({ result, spinning }: { result: 0 | 1 | null; spinning: boolean }) {
  const [deg, setDeg] = useState(0);

  useEffect(() => {
    if (spinning) {
      // On part en rotation longue sans connaître encore l'issue.
      setDeg((d) => d + 360 * 6);
      return;
    }
    if (result === null) return;
    // Atterrissage : multiple de 360 + 180° si Face.
    setDeg((d) => {
      const target = result === 1 ? 180 : 0;
      const base = Math.ceil((d + 720) / 360) * 360;
      return base + target;
    });
  }, [spinning, result]);

  return (
    <div className="coin-stage">
      <div className="coin" style={{ transform: `rotateY(${deg}deg)` }}>
        <div className="coin-face coin-heads">Pile</div>
        <div className="coin-face coin-tails">Face</div>
      </div>
    </div>
  );
}
