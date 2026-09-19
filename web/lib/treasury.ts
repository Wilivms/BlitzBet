import "server-only";
import { decodeEventLog, formatEther, parseEther, type Hash, type TransactionReceipt } from "viem";
import { casinoHubAbi } from "./abi";
import { addresses, monadTestnet } from "./chain";
import { clientFor, houseAccount, lockedSend, playersAccount } from "./wallets";

export const PLAYERS_WALLET = (process.env.NEXT_PUBLIC_PLAYERS_WALLET ??
  "0x828504d626ad39d271006467dc543976f3fb2dcd") as `0x${string}`;

/** 0.05 MON offerts à l'inscription = 500 crédits affichés. */
export const SIGNUP_MON = process.env.NEXT_PUBLIC_BUY_IN ?? "0.05";

/** Transfert natif : 21 000 gas. Monad facture la limite, on ne surprovisionne pas. */
const TRANSFER_GAS = 21_000n;

async function transfer(
  from: "house" | "players",
  to: `0x${string}`,
  wei: bigint,
): Promise<Hash | null> {
  if (wei <= 0n) return null;
  const account = from === "house" ? houseAccount() : playersAccount();
  if (!account) return null; // pas de cle joueurs configuree : on n'echoue pas, on n'envoie pas

  return lockedSend(account, (nonce) =>
    clientFor(account).sendTransaction({
      to,
      value: wei,
      gas: TRANSFER_GAS,
      nonce,
      chain: monadTestnet,
    }),
  );
}

export const fundPlayer = () => transfer("house", PLAYERS_WALLET, parseEther(SIGNUP_MON));

/**
 * Règle la trésorerie d'après le résultat réel de la partie.
 *
 * Le CasinoHub émet un `Settled(playerId, game, wager, payout, chips, netPnl)` pour chaque
 * main réglée, quel que soit le jeu. On somme les `netPnl` du reçu et on ne fait qu'UN
 * virement net, dans le sens qui convient :
 *
 *   netPnl > 0  →  la table a gagné  →  MAISON  paie  JOUEURS
 *   netPnl < 0  →  la table a perdu  →  JOUEURS paie  MAISON
 *
 * Un seul virement par partie plutôt qu'un aller-retour : moitié moins de transactions,
 * ce qui compte avec le plafond de ~15 requêtes/seconde du RPC public.
 */
export async function settleTreasury(receipt: TransactionReceipt): Promise<{
  netPnl: string;
  direction: "house_to_players" | "players_to_house" | "none";
  hash: Hash | null;
}> {
  let net = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== addresses.hub.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: casinoHubAbi as never, ...log }) as unknown as {
        eventName: string;
        args: Record<string, unknown>;
      };
      if (ev.eventName === "Settled") net += BigInt(ev.args.netPnl as bigint);
    } catch {
      /* pas notre evenement */
    }
  }

  if (net === 0n) return { netPnl: "0", direction: "none", hash: null };

  try {
    if (net > 0n) {
      const hash = await transfer("house", PLAYERS_WALLET, net);
      return { netPnl: formatEther(net), direction: "house_to_players", hash };
    }
    const hash = await transfer("players", houseAccount().address as `0x${string}`, -net);
    return { netPnl: formatEther(net), direction: "players_to_house", hash };
  } catch (e) {
    // Une partie jouée ne doit jamais échouer parce qu'un virement a raté.
    console.warn("[treasury] virement echoue:", (e as Error).message);
    return { netPnl: formatEther(net), direction: "none", hash: null };
  }
}
