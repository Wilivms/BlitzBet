import "server-only";
import { createWalletClient, http, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain";
import { kv } from "./kv";
import { publicClient } from "./relayer";

/**
 * Deux signataires.
 *
 *   MAISON  (RELAYER_PRIVATE_KEY) : déploie, tient la bankroll, signe les coups des joueurs.
 *   JOUEURS (PLAYERS_PRIVATE_KEY) : caisse collective des joueurs. Ne signe QUE pour
 *                                   rembourser la maison quand la table perd.
 *
 * Chaque wallet a sa propre séquence de nonces, donc son propre verrou. Partager un verrou
 * les sérialiserait inutilement ; ne pas en avoir du tout ferait s'écraser deux envois
 * simultanés du même wallet — sur Monad, 300 ms de bloc et pas de mempool global, c'est la
 * panne la plus probable d'une table à cinq joueurs.
 */

const rpcUrl =
  process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz/";

function fromEnv(name: string): Account | null {
  const pk = process.env[name];
  if (!pk || pk.trim() === "") return null;
  const hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${name} n'est pas une cle privee hex de 32 octets (0x + 64 caracteres).`);
  }
  return privateKeyToAccount(hex);
}

let house: Account | null | undefined;
let players: Account | null | undefined;

export function houseAccount(): Account {
  if (house === undefined) house = fromEnv("RELAYER_PRIVATE_KEY");
  if (!house) throw new Error("RELAYER_PRIVATE_KEY manquant.");
  return house;
}

/** Optionnel : sans cette cle, les pertes ne sont pas reversees (le reste fonctionne). */
export function playersAccount(): Account | null {
  if (players === undefined) players = fromEnv("PLAYERS_PRIVATE_KEY");
  return players;
}

export function lockedSend<T>(account: Account, job: (nonce: number) => Promise<T>): Promise<T> {
  return kv.withLock(`nonce:${account.address}`, async () => {
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });
    return job(nonce);
  });
}

export function clientFor(account: Account) {
  return createWalletClient({ account, chain: monadTestnet, transport: http(rpcUrl) });
}
