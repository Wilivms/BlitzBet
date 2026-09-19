import { NextResponse } from "next/server";
import { parseEther } from "viem";
import { casinoHubAbi } from "@/lib/abi";
import { addresses } from "@/lib/chain";
import { GAS, send } from "@/lib/relayer";
import { cleanNickname, newSeatId } from "@/lib/seat";
import { SIGNUP_MON, fundPlayer } from "@/lib/treasury";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const nickname = cleanNickname(body?.nickname);
    const buyIn = parseEther(SIGNUP_MON);
    const seatId = newSeatId();

    const { hash } = await send({
      address: addresses.hub,
      abi: casinoHubAbi as never,
      functionName: "join",
      args: [seatId, nickname, buyIn],
      gas: GAS.join,
    });

    // Virement visible maison -> joueurs, en plus des jetons on-chain du hub.
    let fundingHash: string | null = null;
    try {
      fundingHash = await fundPlayer();
    } catch (e) {
      // Le joueur est déjà assis : on ne bloque pas l'inscription pour un virement raté.
      console.warn("[join] virement joueurs echoue:", (e as Error).message);
    }

    invalidate("state");
    return NextResponse.json({ seatId, nickname, buyIn: buyIn.toString(), hash, fundingHash });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
