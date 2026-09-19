#!/usr/bin/env bash
# Regenere web/lib/abi.ts depuis les artefacts Foundry.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd contracts && forge build ${SOLC:+--use "$SOLC"})
O=contracts/out
{
  echo "// Auto-genere depuis les artefacts Foundry (contracts/out). Ne pas editer a la main."
  echo "// Regenerer avec : bash scripts/gen-abi.sh"
  for pair in "CasinoHub:casinoHubAbi" "CoinFlip:coinFlipAbi" "Roulette:rouletteAbi" "Blackjack:blackjackAbi"; do
    n=${pair%%:*}; v=${pair##*:}
    echo "export const $v = $(jq -c '.abi' "$O/$n.sol/$n.json") as const;"
  done
} > web/lib/abi.ts
echo "web/lib/abi.ts regenere"
