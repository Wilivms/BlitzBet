import { NextResponse } from "next/server";
import { parseEther } from "viem";
import { casinoHubAbi } from "@/lib/abi";
import { addresses } from "@/lib/chain";
import { GAS, send } from "@/lib/relayer";
import { cleanNickname, newSeatId } from "@/lib/seat";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const nickname = cleanNickname(body?.nickname);
    const buyIn = parseEther(process.env.NEXT_PUBLIC_BUY_IN ?? "0.5");
    const seatId = newSeatId();

    const { hash } = await send({
      address: addresses.hub,
      abi: casinoHubAbi as never,
      functionName: "join",
      args: [seatId, nickname, buyIn],
      gas: GAS.join,
    });

    return NextResponse.json({ seatId, nickname, buyIn: buyIn.toString(), hash });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
