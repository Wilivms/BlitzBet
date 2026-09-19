/**
 * Affichage seulement. La vérité reste on-chain dans CasinoHub.chips (en MON).
 * Le buy-in de 0.05 MON devient 500 crédits, ce qui se lit comme un casino
 * plutôt que comme un solde de testnet.
 */
export const CREDIT_RATE = 10_000;

export const toCredits = (mon: string | number): number =>
  Math.round(Number(mon || 0) * CREDIT_RATE);

export const fmtCredits = (mon: string | number): string =>
  toCredits(mon).toLocaleString("fr-FR");

/** Signé, pour le P&L. */
export const fmtCreditsSigned = (mon: string | number): string => {
  const c = toCredits(mon);
  return (c > 0 ? "+" : "") + c.toLocaleString("fr-FR");
};
