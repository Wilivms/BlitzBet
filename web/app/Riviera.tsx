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

/** QR pour rejoindre depuis un téléphone ; le script le déplace dans le panneau Classement. */
function JoinQr() {
  const url = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  if (!url) return null;
  return (
    <div id="qrSrc">
      <QRCodeSVG value={url} size={132} bgColor="#f2e9d6" fgColor="#1b120a" />
    </div>
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
