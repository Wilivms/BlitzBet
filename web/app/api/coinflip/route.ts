import { NextResponse } from "next/server";
import { decodeEventLog, parseEther } from "viem";
import { coinFlipAbi } from "@/lib/abi";
import { addresses, explorerTx } from "@/lib/chain";
import { GAS, send } from "@/lib/relayer";
import { isSeatId } from "@/lib/seat";
import { settleTreasury } from "@/lib/treasury";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { seatId, wager, choice } = await req.json();
    if (!isSeatId(seatId)) return NextResponse.json({ error: "seatId invalide" }, { status: 400 });
    if (choice !== 0 && choice !== 1) return NextResponse.json({ error: "choix invalide" }, { status: 400 });
    const stake = parseEther(String(wager ?? "0.05"));
    if (stake < parseEther("0.001")) {
      return NextResponse.json({ error: "mise minimum 0.001 MON" }, { status: 400 });
    }

    const { hash, receipt } = await send({
      address: addresses.coinflip,
      abi: coinFlipAbi as never,
      functionName: "flip",
      args: [seatId, stake, choice],
      gas: GAS.flip,
    });

    // The return value of a state-changing call is not in the receipt, so read the event.
    let result: number | null = null;
    let won = false;
    let payout = "0";
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== addresses.coinflip.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: coinFlipAbi as never, ...log }) as unknown as {
          eventName: string;
          args: Record<string, unknown>;
        };
        if (ev.eventName === "Flipped") {
          result = Number(ev.args.result);
          won = Boolean(ev.args.won);
          payout = String(ev.args.payout);
        }
      } catch {
        /* not our event */
      }
    }

    const treasury = await settleTreasury(receipt);
    return NextResponse.json({ result, won, payout, hash, explorer: explorerTx(hash), treasury });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
