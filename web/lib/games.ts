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

/** État réel de chaque jeu, affiché tel quel dans l'UI et le README. */
export const GAMES = [
  { key: "coinflip", name: "CoinFlip", tagline: "Pile ou face, double ou rien", status: "live" },
  { key: "roulette", name: "Roulette", tagline: "Européenne, zéro unique, table partagée", status: "live" },
  { key: "blackjack", name: "Blackjack", tagline: "Contre le contrat, split & double", status: "roadmap" },
  { key: "aviator", name: "Aviator", tagline: "Multiplicateur on-chain, un tick par bloc", status: "roadmap" },
] as const;
