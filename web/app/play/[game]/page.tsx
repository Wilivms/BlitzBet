import { redirect } from "next/navigation";

/** Anciens liens /play/<jeu> : on ouvre directement la bonne table du salon. */
export default async function PlayGame({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const known = ["aviator", "roulette", "coinflip", "blackjack"];
  redirect(known.includes(game) ? `/?g=${game}` : "/");
}
