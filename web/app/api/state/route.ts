import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { casinoHubAbi, rouletteAbi } from "@/lib/abi";
import { addresses } from "@/lib/chain";
import { publicClient } from "@/lib/relayer";

export const dynamic = "force-dynamic";

/** One poll drives the whole table: leaderboard, bankroll and the live roulette round. */
export async function GET() {
  try {
    if (!addresses.hub) {
      return NextResponse.json({ error: "NEXT_PUBLIC_CASINO_HUB non configure" }, { status: 503 });
    }
    const hub = { address: addresses.hub, abi: casinoHubAbi as never } as const;
    const wheel = { address: addresses.roulette, abi: rouletteAbi as never } as const;

    // viem batches these into a single RPC message (docs: "Reduce latency with concurrent calls").
    const [bankroll, board, roundId, isOpen, lastResult, betsInRound] = await Promise.all([
      publicClient.readContract({ ...hub, functionName: "bankroll" }) as Promise<bigint>,
      publicClient.readContract({ ...hub, functionName: "leaderboard" }) as Promise<
        [readonly `0x${string}`[], readonly string[], readonly bigint[], readonly bigint[], readonly bigint[]]
      >,
      publicClient.readContract({ ...wheel, functionName: "roundId" }) as Promise<bigint>,
      publicClient.readContract({ ...wheel, functionName: "isOpen" }) as Promise<boolean>,
      publicClient.readContract({ ...wheel, functionName: "lastResult" }) as Promise<number>,
      publicClient.readContract({ ...wheel, functionName: "betsInRound" }) as Promise<bigint>,
    ]);

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

    return NextResponse.json({
      bankroll: formatEther(bankroll),
      players,
      roulette: {
        roundId: Number(roundId),
        isOpen,
        lastResult: Number(lastResult),
        betsInRound: Number(betsInRound),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
