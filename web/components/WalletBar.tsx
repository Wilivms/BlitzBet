"use client";
import { useEffect, useState } from "react";

const HOUSE = "0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368";
const PLAYERS = process.env.NEXT_PUBLIC_PLAYERS_WALLET ?? "0x828504d626ad39d271006467dc543976f3fb2dcd";
const EXPLORER = "https://testnet.monadvision.com/address/";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

/**
 * Les joueurs n'ont pas de wallet : la maison signe pour eux. Cette barre rend les deux
 * wallets du casino visibles et vérifiables, et permet à qui le souhaite de connecter le
 * sien pour contrôler l'adresse et le réseau. Ça ne change rien au déroulé d'une partie.
 */
export function WalletBar() {
  const [addr, setAddr] = useState<string | null>(null);
  const [chain, setChain] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_accounts" })
      .then((a) => { const l = a as string[]; if (l?.[0]) setAddr(l[0]); })
      .catch(() => undefined);
  }, []);

  async function connect() {
    setErr(null);
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) { setErr("Aucun wallet détecté dans ce navigateur."); return; }
    try {
      const a = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddr(a?.[0] ?? null);
      const c = (await eth.request({ method: "eth_chainId" })) as string;
      setChain(c);
      if (c !== "0x279f") setErr("Vous n'êtes pas sur Monad testnet (chain 10143).");
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <section className="card p-5 mt-5">
      <h2 className="eyebrow mb-3.5">Wallets du casino</h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="muted">Maison</span>
          <a href={EXPLORER + HOUSE} target="_blank" rel="noreferrer" className="mono-link">{short(HOUSE)}</a>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="muted">Joueurs</span>
          <a href={EXPLORER + PLAYERS} target="_blank" rel="noreferrer" className="mono-link">{short(PLAYERS)}</a>
        </div>
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
        {addr ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="muted">Votre wallet</span>
            <a href={EXPLORER + addr} target="_blank" rel="noreferrer" className="mono-link">{short(addr)}</a>
          </div>
        ) : (
          <button className="btn w-full text-sm" onClick={connect}>Connecter mon wallet</button>
        )}
        {chain && chain !== "0x279f" && <p className="text-xs mt-2" style={{ color: "var(--berry)" }}>Réseau : {chain}</p>}
        {err && <p className="text-xs mt-2 muted">{err}</p>}
        <p className="text-xs muted mt-3">
          Optionnel. Les joueurs n&apos;ont besoin d&apos;aucun wallet : la maison signe chaque mise.
        </p>
      </div>
    </section>
  );
}
