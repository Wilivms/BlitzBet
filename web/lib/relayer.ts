import "server-only";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain";
import { kv } from "./kv";

/**
 * BlitzBet has exactly one wallet. It deploys the contracts, holds the bankroll and signs
 * every seat's bet -- spectators join by scanning a QR code and never hold a key.
 *
 * That makes nonce handling the single most likely way the live demo falls over. Monad
 * blocks are 300ms and there is no global mempool, so five people tapping "bet" at once
 * means five transactions racing for the same nonce. Everything below exists to stop that:
 *
 *  - a distributed lock (lib/kv.ts) around "read the chain's pending nonce, sign, broadcast",
 *    so only one send is in flight at a time -- across every Vercel instance, not just this
 *    process. An in-memory queue alone is not enough: Vercel can run a route's handler in
 *    several concurrent serverless instances, each with its own memory, which would defeat
 *    a plain in-process mutex exactly when the table gets busy.
 *  - re-deriving the nonce from eth_getTransactionCount(pending) on every send rather than
 *    keeping a local counter, so a send that fails before broadcasting never leaves a
 *    permanent gap in the account's nonce sequence (a gap would stall every later
 *    transaction until something fills it).
 *  - an explicit gas limit on every call, because Monad charges the gas *limit*, not the
 *    gas used. A lazy 30M limit would burn ~3 MON per bet.
 */

const rpcUrl = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz/";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(rpcUrl, { batch: true }),
});

function loadAccount() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "RELAYER_PRIVATE_KEY manquant. Cree web/.env.local a partir de web/.env.example.",
    );
  }
  return privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
}

let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;
export function relayerAccount() {
  if (!cachedAccount) cachedAccount = loadAccount();
  return cachedAccount;
}

function walletClient() {
  return createWalletClient({
    account: relayerAccount(),
    chain: monadTestnet,
    transport: http(rpcUrl),
  });
}

// ------------------------------------------------------------------ nonce lock --

/**
 * Run `job` exclusively, holding a distributed lock for the relayer address. The nonce is
 * read fresh from the chain inside the lock every time: if `job` throws before broadcasting,
 * nothing was ever consumed, so the next caller gets the same nonce back rather than a gap.
 */
function withNonce<T>(job: (nonce: number) => Promise<T>): Promise<T> {
  return kv.withLock(`nonce:${relayerAccount().address}`, async () => {
    const nonce = await publicClient.getTransactionCount({
      address: relayerAccount().address,
      blockTag: "pending",
    });
    return job(nonce);
  });
}

export type SendArgs = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  /** Explicit limit. Monad bills the limit, so keep these tight. */
  gas: bigint;
};

export type SendResult = { hash: Hash; receipt: TransactionReceipt };

export async function send({ address, abi, functionName, args, gas }: SendArgs): Promise<SendResult> {
  return withNonce(async (nonce) => {
    const wallet = walletClient();
    const hash = await wallet.writeContract({
      address,
      abi,
      functionName,
      args: args as never,
      gas,
      nonce,
      chain: monadTestnet,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      // 300ms blocks, finality at 2 blocks. Poll fast or the table feels laggy.
      pollingInterval: 150,
      timeout: 30_000,
    });
    if (receipt.status !== "success") throw new Error(`transaction revertee: ${hash}`);
    return { hash, receipt };
  });
}

/**
 * Gas limits, measured from the Foundry suite and padded hard for Monad's repricing:
 * cold account access is 10,100 (vs 2,600) and the first touch of a 128-slot storage page
 * costs 8,100, so real usage runs well above what a local forge test reports.
 */
export const GAS = {
  join: 260_000n,
  flip: 520_000n,
  openRound: 450_000n,
  placeBet: 420_000n,
  /** The spin settles every bet in the round in one transaction. */
  spin: (bets: number) => 400_000n + BigInt(bets) * 180_000n,
  // Blackjack writes a card into storage on every action, and stand/double trigger the
  // whole showdown (dealer draws to 17, then every hand is settled) in one transaction.
  deal: 1_300_000n,
  hit: 900_000n,
  stand: 1_700_000n,
  double: 1_700_000n,
  split: 1_100_000n,
  // Aviator: opening clears the previous round's seats, revealing settles the whole table.
  avOpen: (seats: number) => 500_000n + BigInt(seats) * 60_000n,
  avBet: 500_000n,
  avLaunch: 200_000n,
  avCashOut: 350_000n,
  avReveal: (seats: number) => 500_000n + BigInt(seats) * 200_000n,
} as const;
