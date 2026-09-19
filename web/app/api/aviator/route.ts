import { NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import { aviatorAbi } from "@/lib/abi";
import { addresses, explorerTx } from "@/lib/chain";
import { GAS, publicClient, send } from "@/lib/relayer";
import { mintSeed, seedFor } from "@/lib/aviatorSeed";
import { isSeatId } from "@/lib/seat";
import { cached, invalidate } from "@/lib/cache";
import { settleTreasury } from "@/lib/treasury";

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
  return cached("aviator", 300, snapshotUncached);
}

/** 300 ms = un bloc Monad. Dix clients ne declenchent qu'un seul appel RPC. */
async function snapshotUncached() {
  const [roundId, phase, tick, multiplierBp, seats, lastCrashBp] =
    (await publicClient.multicall({
      contracts: [
        { ...av, functionName: "roundId" },
        { ...av, functionName: "phase" },
        { ...av, functionName: "currentTick" },
        { ...av, functionName: "currentMultiplierBp" },
        { ...av, functionName: "seats" },
        { ...av, functionName: "lastCrashBp" },
      ],
      allowFailure: false,
      multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    })) as [bigint, number, bigint, bigint, RawSeat[], bigint];

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
  const seed = await seedFor(snap.roundId);
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
    const { receipt } = await send({
      ...av,
      functionName: "reveal",
      args: [seed],
      gas: GAS.avReveal(snap.seats.length),
    });
    // Le reveal solde tous les sieges d'un coup : un seul virement net pour la table.
    await settleTreasury(receipt);
    invalidate("aviator");
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
      const { commitment } = await mintSeed(nextRound);
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
