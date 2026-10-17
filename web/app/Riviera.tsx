"use client";

import { memo, useSyncExternalStore } from "react";
import Script from "next/script";
import { QRCodeSVG } from "qrcode.react";
import { RIVIERA_MARKUP } from "./riviera-markup";

/**
 * Le salon est une scène three.js pilotée par public/riviera.js. React ne fait que poser le
 * balisage une fois ; le script le prend en main et ne le rend jamais à React.
 */
const Stage = memo(function Stage({ house, players }: { house: string; players: string }) {
  const html = RIVIERA_MARKUP.replace("{{HOUSE}}", house).replace("{{PLAYERS}}", players);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

/**
 * QR pour rejoindre depuis un téléphone : une petite carte sur l'écran de table (grand écran),
 * et un grand format ouvert par « Inviter · QR ». Le script ne fait que basculer la classe `open`.
 */
function JoinQr() {
  const url = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  if (!url) return null;
  const host = url.replace(/^https?:\/\//, "");
  return (
    <>
      <div id="qrCard" title="Agrandir le QR code">
        <div className="qr">
          <QRCodeSVG value={url} size={96} bgColor="#f2e9d6" fgColor="#1b120a" />
        </div>
        <span>Scannez pour jouer</span>
      </div>
      <div id="qrBig" role="dialog" aria-label="QR code pour rejoindre">
        <div className="box">
          <h2>Rejoignez la table</h2>
          <div className="qr">
            <QRCodeSVG value={url} size={360} bgColor="#f2e9d6" fgColor="#1b120a" />
          </div>
          <p>Scannez, choisissez un pseudo, misez. Aucun wallet requis.</p>
          <small>{host} · touchez pour fermer</small>
        </div>
      </div>
    </>
  );
}

export function Riviera({ house, players }: { house: string; players: string }) {
  return (
    <>
      <Stage house={house} players={players} />
      <JoinQr />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" strategy="afterInteractive" />
      <Script src="/riviera.js" strategy="afterInteractive" />
    </>
  );
}
