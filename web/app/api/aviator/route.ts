import { NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import { aviatorAbi } from "@/lib/abi";
import { addresses, explorerTx } from "@/lib/chain";
import { GAS, publicClient, send } from "@/lib/relayer";
import { mintSeed, seedFor } from "@/lib/aviatorSeed";
import { isSeatId } from "@/lib/seat";

export const dynamic = "force-dynamic";

const av = { address: addresses.aviator, abi: aviatorAbi as never } as const;
const PHASES = ["idle", "betting", "flying", "settled"] as const;

type RawSeat = {
  playerId: `0x${string}`;
  wager: bigint;
  cashOutTick: number;
  cashedOut: boolean;
  payout: bigint;
};

async function snapshot() {
  const [roundId, phase, tick, multiplierBp, seats, lastCrashBp] = await Promise.all([
    publicClient.readContract({ ...av, functionName: "roundId" }) as Promise<bigint>,
    publicClient.readContract({ ...av, functionName: "phase" }) as Promise<number>,
    publicClient.readContract({ ...av, functionName: "currentTick" }) as Promise<bigint>,
    publicClient.readContract({ ...av, functionName: "currentMultiplierBp" }) as Promise<bigint>,
    publicClient.readContract({ ...av, functionName: "seats" }) as Promise<RawSeat[]>,
    publicClient.readContract({ ...av, functionName: "lastCrashBp" }) as Promise<bigint>,
  ]);

  return {
    roundId: Number(roundId),
    phase: PHASES[Number(phase)] ?? "idle",
    tick: Number(tick),
    multiplier: Number(multiplierBp) / 10_000,
    lastCrash: Number(lastCrashBp) / 10_000,
    seats: seats.map((s) => ({
      seatId: s.playerId,
      wager: formatEther(s.wager),
      cashedOut: s.cashedOut,
      cashOutTick: Number(s.cashOutTick),
      payout: formatEther(s.payout),
    })),
  };
}

/**
 * The plane has to go down on its own, not when a human clicks. The server holds the seed,
 * so it knows the crash tick; once the chain's block height reaches it, the reveal fires.
 */
let revealing = false;
async function autoRevealIfCrashed(snap: Awaited<ReturnType<typeof snapshot>>) {
  if (snap.phase !== "flying" || revealing) return snap;
  const seed = seedFor(snap.roundId);
  if (!seed) return snap;

  const crashBp = (await publicClient.readContract({
    ...av,
    functionName: "crashPointBp",
    args: [seed],
  })) as bigint;
  const crashTick = (await publicClient.readContract({
    ...av,
    functionName: "crashTickOf",
    args: [crashBp],
  })) as number;

  if (snap.tick < Number(crashTick)) return snap;

  revealing = true;
  try {
    await send({
      ...av,
      functionName: "reveal",
      args: [seed],
      gas: GAS.avReveal(snap.seats.length),
    });
    return await snapshot();
  } finally {
    revealing = false;
  }
}

export async function GET() {
  try {
    if (!addresses.aviator) {
      return NextResponse.json({ error: "NEXT_PUBLIC_AVIATOR non configure" }, { status: 503 });
    }
    return NextResponse.json(await autoRevealIfCrashed(await snapshot()));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, seatId, wager } = await req.json();

    if (action === "open") {
      const nextRound = Number(
        (await publicClient.readContract({ ...av, functionName: "roundId" })) as bigint,
      ) + 1;
      const seatsNow = Number(
        (await publicClient.readContract({ ...av, functionName: "seatCount" })) as bigint,
      );
      const { commitment } = mintSeed(nextRound);
      const { hash } = await send({
        ...av,
        functionName: "openRound",
        args: [commitment],
        gas: GAS.avOpen(seatsNow),
      });
      return NextResponse.json({ ok: true, commitment, hash, explorer: explorerTx(hash) });
    }

    if (action === "launch") {
      const { hash } = await send({ ...av, functionName: "launch", args: [], gas: GAS.avLaunch });
      return NextResponse.json({ ok: true, hash, explorer: explorerTx(hash) });
    }

    if (action === "bet") {
      if (!isSeatId(seatId)) return NextResponse.json({ error: "seatId invalide" }, { status: 400 });
      const stake = parseEther(String(wager ?? "0.05"));
      const { hash } = await send({ ...av, functionName: "placeBet", args: [seatId, stake], gas: GAS.avBet });
      return NextResponse.json({ ok: true, hash, explorer: explorerTx(hash) });
    }

    if (action === "cashout") {
      if (!isSeatId(seatId)) return NextResponse.json({ error: "seatId invalide" }, { status: 400 });
      const { hash, receipt } = await send({
        ...av,
        functionName: "cashOut",
        args: [seatId],
        gas: GAS.avCashOut,
      });
      const snap = await snapshot();
      const mine = snap.seats.find((s) => s.seatId.toLowerCase() === String(seatId).toLowerCase());
      return NextResponse.json({
        ok: true,
        tick: mine?.cashOutTick ?? null,
        blockNumber: Number(receipt.blockNumber),
        hash,
        explorer: explorerTx(hash),
      });
    }

    if (action === "abort") {
      const seatsNow = Number(
        (await publicClient.readContract({ ...av, functionName: "seatCount" })) as bigint,
      );
      const { hash } = await send({
        ...av,
        functionName: "abortRound",
        args: [],
        gas: GAS.avReveal(seatsNow),
      });
      return NextResponse.json({ ok: true, hash, explorer: explorerTx(hash) });
    }

    return NextResponse.json({ error: "action inconnue" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
