import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { casinoHubAbi, rouletteAbi } from "@/lib/abi";
import { addresses } from "@/lib/chain";
import { publicClient } from "@/lib/relayer";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** One poll drives the whole table: leaderboard, bankroll and the live roulette round. */
export async function GET() {
  try {
    const payload = await cached("state", 700, async () => {
    if (!addresses.hub) {
      return NextResponse.json({ error: "NEXT_PUBLIC_CASINO_HUB non configure" }, { status: 503 });
    }
    const hub = { address: addresses.hub, abi: casinoHubAbi as never } as const;
    const wheel = { address: addresses.roulette, abi: rouletteAbi as never } as const;

    // Multicall3 : les 6 lectures deviennent UN seul eth_call.
    // Le RPC public plafonne a 15 req/s ; sans ca, un seul ecran le sature.
    const [bankroll, board, roundId, isOpen, lastResult, betsInRound] =
      (await publicClient.multicall({
        contracts: [
          { ...hub, functionName: "bankroll" },
          { ...hub, functionName: "leaderboard" },
          { ...wheel, functionName: "roundId" },
          { ...wheel, functionName: "isOpen" },
          { ...wheel, functionName: "lastResult" },
          { ...wheel, functionName: "betsInRound" },
        ],
        allowFailure: false,
        multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
      })) as [bigint, [readonly `0x${string}`[], readonly string[], readonly bigint[], readonly bigint[], readonly bigint[]], bigint, boolean, number, bigint];

    const [ids, nicks, chips, pnl, bets] = board;
    const players = ids
      .map((id, i) => ({
        seatId: id,
        nickname: nicks[i] || "Anon",
        chips: formatEther(chips[i]),
        pnl: formatEther(pnl[i]),
        pnlRaw: pnl[i].toString(),
        bets: Number(bets[i]),
      }))
      .sort((a, b) => (BigInt(b.pnlRaw) > BigInt(a.pnlRaw) ? 1 : -1));

    return {
      bankroll: formatEther(bankroll),
      players,
      roulette: {
        roundId: Number(roundId),
        isOpen,
        lastResult: Number(lastResult),
        betsInRound: Number(betsInRound),
      },
    };
    });

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
