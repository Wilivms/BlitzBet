export const BET_TYPES = [
  { id: 0, label: "Numéro plein", odds: "35:1", needsValue: true },
  { id: 1, label: "Rouge", odds: "1:1", needsValue: false },
  { id: 2, label: "Noir", odds: "1:1", needsValue: false },
  { id: 3, label: "Pair", odds: "1:1", needsValue: false },
  { id: 4, label: "Impair", odds: "1:1", needsValue: false },
  { id: 5, label: "Manque (1-18)", odds: "1:1", needsValue: false },
  { id: 6, label: "Passe (19-36)", odds: "1:1", needsValue: false },
  { id: 7, label: "Douzaine", odds: "2:1", needsValue: true },
] as const;

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const isRed = (n: number) => RED.has(n);
export const pocketColour = (n: number) => (n === 0 ? "green" : isRed(n) ? "red" : "black");

export type GameKey = "coinflip" | "roulette" | "blackjack" | "aviator";

/** Les quatre jeux, tous déployés et jouables on-chain. */
export const GAMES: { key: GameKey; name: string; tagline: string; meta: string }[] = [
  {
    key: "aviator",
    name: "Aviator",
    tagline: "Le multiplicateur monte d’un cran par bloc. Encaissez avant le crash.",
    meta: "1.02× par bloc · provably fair",
  },
  {
    key: "coinflip",
    name: "CoinFlip",
    tagline: "Pile ou face. Résultat immédiat, en une transaction.",
    meta: "2× · double ou rien",
  },
  {
    key: "roulette",
    name: "Roulette",
    tagline: "Européenne à zéro unique. Toute la table mise sur la même roue.",
    meta: "jusqu’à 35:1",
  },
  {
    key: "blackjack",
    name: "Blackjack",
    tagline: "Contre le contrat. Tirer, rester, doubler, séparer.",
    meta: "blackjack payé 3:2",
  },
];
