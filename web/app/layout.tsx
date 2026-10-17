import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlitzBet — Casino Riviera on-chain",
  description:
    "Casino 3D entièrement on-chain sur Monad testnet : blackjack, roulette, L'Envol et pile ou face. Le public mise depuis son téléphone, sans wallet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0a08",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&family=Limelight&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
