import { NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import { blackjackAbi } from "@/lib/abi";
import { addresses, explorerTx } from "@/lib/chain";
import { GAS, publicClient, send } from "@/lib/relayer";
import { isSeatId } from "@/lib/seat";
import { settleTreasury } from "@/lib/treasury";

export const dynamic = "force-dynamic";

const bj = { address: addresses.blackjack, abi: blackjackAbi as never } as const;

type RawHand = {
  cards: readonly number[];
  wager: bigint;
  doubled: boolean;
  state: number;
  payout: bigint;
};

const STATE_LABEL = ["active", "stood", "bust", "settled"] as const;

/** Reads the full table picture for a game id so the phone can render it in one shot. */
async function readGame(gameId: bigint) {
  const [hands, dealer, meta] = await Promise.all([
    publicClient.readContract({ ...bj, functionName: "handsOf", args: [gameId] }) as Promise<RawHand[]>,
    publicClient.readContract({ ...bj, functionName: "dealerCards", args: [gameId] }) as Promise<readonly number[]>,
    publicClient.readContract({ ...bj, functionName: "gameOf", args: [gameId] }) as Promise<
      readonly [`0x${string}`, number, boolean, boolean]
    >,
  ]);

  const dealerTotal = (await publicClient.readContract({
    ...bj,
    functionName: "value",
    args: [dealer],
  })) as readonly [number, boolean];

  const handsOut = await Promise.all(
    hands.map(async (h) => {
      const v = (await publicClient.readContract({
        ...bj,
        functionName: "value",
        args: [h.cards],
      })) as readonly [number, boolean];
      return {
        cards: [...h.cards],
        total: Number(v[0]),
        soft: Boolean(v[1]),
        wager: formatEther(h.wager),
        doubled: h.doubled,
        state: STATE_LABEL[Number(h.state)] ?? "active",
        payout: formatEther(h.payout),
      };
    }),
  );

  return {
    gameId: Number(gameId),
    hands: handsOut,
    dealer: { cards: [...dealer], total: Number(dealerTotal[0]) },
    activeHand: Number(meta[1]),
    finished: Boolean(meta[2]),
    wasSplit: Boolean(meta[3]),
  };
}

export async function POST(req: Request) {
  try {
    const { action, seatId, wager } = await req.json();
    if (!isSeatId(seatId)) return NextResponse.json({ error: "seatId invalide" }, { status: 400 });

    let hash: `0x${string}`;
    let receipt: Awaited<ReturnType<typeof send>>["receipt"];
    if (action === "deal") {
      const stake = parseEther(String(wager ?? "0.05"));
      if (stake < parseEther("0.001")) {
        return NextResponse.json({ error: "mise minimum 0.001 MON" }, { status: 400 });
      }
      ({ hash, receipt } = await send({ ...bj, functionName: "deal", args: [seatId, stake], gas: GAS.deal }));
    } else if (action === "hit") {
      ({ hash, receipt } = await send({ ...bj, functionName: "hit", args: [seatId], gas: GAS.hit }));
    } else if (action === "stand") {
      ({ hash, receipt } = await send({ ...bj, functionName: "stand", args: [seatId], gas: GAS.stand }));
    } else if (action === "double") {
      ({ hash, receipt } = await send({ ...bj, functionName: "doubleDown", args: [seatId], gas: GAS.double }));
    } else if (action === "split") {
      ({ hash, receipt } = await send({ ...bj, functionName: "split", args: [seatId], gas: GAS.split }));
    } else {
      return NextResponse.json({ error: "action inconnue" }, { status: 400 });
    }

    // After a stand or a bust the seat is released, so fall back to the last game id.
    let gameId = (await publicClient.readContract({
      ...bj,
      functionName: "activeGameOf",
      args: [seatId],
    })) as bigint;
    if (gameId === 0n) {
      gameId = (await publicClient.readContract({ ...bj, functionName: "gameCount" })) as bigint;
    }

    const game = await readGame(gameId);
    const treasury = await settleTreasury(receipt);
    return NextResponse.json({ ...game, hash, explorer: explorerTx(hash), treasury });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const seatId = new URL(req.url).searchParams.get("seatId");
    if (!isSeatId(seatId)) return NextResponse.json({ error: "seatId invalide" }, { status: 400 });
    const gameId = (await publicClient.readContract({
      ...bj,
      functionName: "activeGameOf",
      args: [seatId],
    })) as bigint;
    if (gameId === 0n) return NextResponse.json({ gameId: 0, hands: [], finished: true });
    return NextResponse.json(await readGame(gameId));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
