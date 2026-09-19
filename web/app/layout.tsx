import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlitzBet — casino on-chain sur Monad",
  description:
    "Casino multi-joueurs entièrement on-chain sur Monad testnet. Le public mise depuis son téléphone, sans wallet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
