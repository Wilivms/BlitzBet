import { defineChain } from "viem";

/// Monad Testnet. Values come straight from docs.monad.xyz/developer-essentials/testnet.
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz/"] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

export const addresses = {
  hub: (process.env.NEXT_PUBLIC_CASINO_HUB ?? "") as `0x${string}`,
  coinflip: (process.env.NEXT_PUBLIC_COINFLIP ?? "") as `0x${string}`,
  roulette: (process.env.NEXT_PUBLIC_ROULETTE ?? "") as `0x${string}`,
  blackjack: (process.env.NEXT_PUBLIC_BLACKJACK ?? "") as `0x${string}`,
};

export const explorerTx = (hash: string) =>
  `https://testnet.monadexplorer.com/tx/${hash}`;
