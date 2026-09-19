import { NextResponse } from "next/server";
import { decodeEventLog, parseEther } from "viem";
import { rouletteAbi } from "@/lib/abi";
import { addresses, explorerTx } from "@/lib/chain";
import { GAS, publicClient, send } from "@/lib/relayer";
import { isSeatId } from "@/lib/seat";
import { settleTreasury } from "@/lib/treasury";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action;

    if (action === "open") {
      const { hash } = await send({
        address: addresses.roulette,
        abi: rouletteAbi as never,
        functionName: "openRound",
        args: [],
        gas: GAS.openRound,
      });
      return NextResponse.json({ ok: true, hash, explorer: explorerTx(hash) });
    }

    if (action === "bet") {
      const { seatId, wager, betType, value } = body;
      if (!isSeatId(seatId)) return NextResponse.json({ error: "seatId invalide" }, { status: 400 });
      const t = Number(betType);
      const v = Number(value ?? 0);
      if (!Number.isInteger(t) || t < 0 || t > 7) {
        return NextResponse.json({ error: "type de mise invalide" }, { status: 400 });
      }
      if (t === 0 && (v < 0 || v > 36)) {
        return NextResponse.json({ error: "numéro hors table" }, { status: 400 });
      }
      if (t === 7 && (v < 0 || v > 2)) {
        return NextResponse.json({ error: "douzaine invalide" }, { status: 400 });
      }
      const stake = parseEther(String(wager ?? "0.05"));
      const { hash } = await send({
        address: addresses.roulette,
        abi: rouletteAbi as never,
        functionName: "placeBet",
        args: [seatId, stake, t, v],
        gas: GAS.placeBet,
      });
      return NextResponse.json({ ok: true, hash, explorer: explorerTx(hash) });
    }

    if (action === "spin") {
      // The spin settles every bet in the round in one transaction, so the gas limit has to
      // scale with the table. Monad bills the limit, hence reading the count first.
      const bets = (await publicClient.readContract({
        address: addresses.roulette,
        abi: rouletteAbi as never,
        functionName: "betsInRound",
      })) as bigint;

      const { hash, receipt } = await send({
        address: addresses.roulette,
        abi: rouletteAbi as never,
        functionName: "spin",
        args: [],
        gas: GAS.spin(Number(bets)),
      });

      let result: number | null = null;
      const settled: { seatId: string; won: boolean; payout: string }[] = [];
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== addresses.roulette.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: rouletteAbi as never, ...log }) as unknown as {
            eventName: string;
            args: Record<string, unknown>;
          };
          if (ev.eventName === "Spun") result = Number(ev.args.result);
          if (ev.eventName === "BetSettled") {
            settled.push({
              seatId: String(ev.args.playerId),
              won: Boolean(ev.args.won),
              payout: String(ev.args.payout),
            });
          }
        } catch {
          /* not our event */
        }
      }
      const treasury = await settleTreasury(receipt);
      return NextResponse.json({ ok: true, result, settled, hash, explorer: explorerTx(hash), treasury });
    }

    return NextResponse.json({ error: "action inconnue" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
