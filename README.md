# BlitzBet

**Un casino on-chain où le public joue sans wallet — et un crash game dont le multiplicateur
vit réellement sur la chaîne, ce qui n'est jouable qu'à 300 ms de bloc.**

Monad Blitz Paris — 19 septembre 2026.

---

## L'idée

Tous les crash games en production (Aviator et ses clones) animent le multiplicateur dans le
navigateur et gardent le point de crash sur un serveur privé. Ils n'ont pas le choix : sur une
chaîne à 2-12 secondes de bloc, un multiplicateur indexé sur la hauteur de bloc avancerait
trois ou quatre fois avant la fin du tour. Injouable.

Monad produit un bloc toutes les 300 ms. `block.number - startBlock` devient une horloge
utilisable : le multiplicateur avance ~3,3 fois par seconde, et l'encaissement d'un joueur est
une vraie transaction qui atterrit dans un bloc précis. **Le bloc dans lequel elle atterrit
*est* le multiplicateur obtenu.** Rien dans le timing n'est pris sur parole.

C'est le seul des quatre jeux qui ne pourrait pas exister ailleurs. Les trois autres
(CoinFlip, Roulette, Blackjack) sont là pour faire une vraie table de casino autour.

## Ce qui tourne

| Jeu | Description | Statut |
|---|---|---|
| **Aviator** | Crash game, multiplicateur à 1,02× par bloc, commit-reveal | ✅ écrit, testé |
| **CoinFlip** | Pile ou face, double ou rien | ✅ écrit, testé |
| **Roulette** | Européenne zéro unique, table partagée, 8 types de mise | ✅ écrit, testé |
| **Blackjack** | Contre le contrat, hit/stand/double/split, croupier à 17 | ✅ écrit, testé |

**54 tests Foundry, tous au vert.** Chaque suite vérifie après chaque coup que le registre du
hub correspond toujours au solde réel du contrat — le casino ne peut pas devoir plus qu'il ne
détient.

### Adresses déployées (Monad testnet, chain 10143)

Déployés le 19 septembre 2026, 9 transactions (5 créations + 4 `setGame`), toutes
confirmées avec succès (`status=0x1`).

| Contrat | Adresse |
|---|---|
| CasinoHub | [`0x46a1b46016cf0c0e328aa5d304f2f11257b21a16`](https://testnet.monadexplorer.com/address/0x46a1b46016cf0c0e328aa5d304f2f11257b21a16) |
| CoinFlip | [`0x271926351dbd8e3df8b123a72a643ff3a16c71e9`](https://testnet.monadexplorer.com/address/0x271926351dbd8e3df8b123a72a643ff3a16c71e9) |
| Roulette | [`0xb8541269534707b494aeaf61cf6bb2688b3cfe84`](https://testnet.monadexplorer.com/address/0xb8541269534707b494aeaf61cf6bb2688b3cfe84) |
| Blackjack | [`0x4fc577fe0aed3815dbe1cbea0ab18f7b7317e7ef`](https://testnet.monadexplorer.com/address/0x4fc577fe0aed3815dbe1cbea0ab18f7b7317e7ef) |
| Aviator | [`0xbef18258cc7f7c4f29042dd1c11f3ff549505e56`](https://testnet.monadexplorer.com/address/0xbef18258cc7f7c4f29042dd1c11f3ff549505e56) |

Wallet unique (déploiement + bankroll + signature de toutes les mises) :
[`0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368`](https://testnet.monadexplorer.com/address/0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368)

## Architecture

```
CasinoHub ──┬── CoinFlip
            ├── Roulette
            ├── Blackjack
            └── Aviator
```

`CasinoHub` détient la bankroll, le registre de jetons par siège, le classement et la source
d'aléa. Les jeux ne manipulent jamais de MON directement : ils appellent `hub.settle()`.

**Les joueurs n'ont pas de wallet.** Un spectateur scanne le QR code de la table, choisit un
pseudo, et reçoit un `bytes32` — son siège. La maison le dote en jetons depuis la bankroll et
signe ensuite toutes ses transactions. Un seul wallet pour toute la table :
`0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368`.

C'est **custodial par construction**, et c'est assumé : l'objectif était qu'un public de
passage puisse jouer en dix secondes depuis son téléphone, pas de construire un casino sans
confiance.

## Ce que Monad a changé dans le code

Quatre points de la doc ont directement façonné l'implémentation.

**1. `TIMESTAMP` est à la seconde, les blocs à 300 ms** → 3-4 blocs consécutifs partagent le
même timestamp. Le seed d'aléa ne s'appuie donc pas dessus : il combine `blockhash`,
`prevrandao`, un compteur par siège et un compteur global.

**2. Un seul wallet signe tout** → `tx.origin` est une constante et ne protège de rien. La
garde anti-rejeu est un double compteur en storage : deux tirages ne partagent jamais un seed,
même dans le même bloc. Un test le vérifie explicitement.

**3. Monad facture le *gas limit*, pas le gas consommé** → chaque appel du relayer porte une
limite explicite et serrée. Une limite paresseuse à 30M coûterait ~3 MON par mise.

**4. Reserve balance de 10 MON, pas de mempool global** → avec un wallet unique qui signe pour
cinq joueurs simultanés, les nonces sont le point de rupture n°1. `web/lib/relayer.ts` prend un
verrou distribué (Redis, via `web/lib/kv.ts`) autour de « lire le nonce en attente, signer,
diffuser », et relit ce nonce depuis la chaîne à chaque appel plutôt que de garder un compteur
local — un compteur en mémoire de processus ne suffit pas une fois déployé sur des fonctions
serverless Vercel, qui peuvent exécuter plusieurs instances en parallèle sous charge.

## Équité et limites — à lire avant de jouer avec du vrai argent (ne le faites pas)

**Aviator est provably fair.** Le point de crash est dérivé d'un seed dont le hash est publié
*avant* la première mise (formule bustabit, ~3 % d'avantage maison via les crashs instantanés).
Les encaissements sont enregistrés mais pas payés avant la révélation — c'est cet ordre qui
empêche la maison de régler un encaissement dont elle sait déjà qu'il est arrivé après le
crash. N'importe qui peut recalculer un tour à partir du hash engagé.

**Les trois autres jeux ne le sont pas.** Ils tirent leur aléa de `blockhash` + compteurs.
C'est imprévisible pour un joueur et non rejouable, mais un validateur Monad pourrait le
biaiser. Aucun VRF, par choix, pour tenir dans la journée. **Ne déployez pas ça en mainnet
avec de l'argent réel.**

Autres limites assumées :

- Le seed Aviator vit en mémoire du serveur. Un redémarrage en plein tour le perd — d'où
  `abortRound()`, qui rembourse tous les mises plutôt que de laisser la maison garder des
  jetons qu'elle ne peut plus régler.
- Le siège est un `bytes32` en localStorage : quiconque l'obtient peut miser ces jetons.
  Acceptable pour du testnet, inacceptable ailleurs.
- Blackjack tire d'un sabot infini — pas de comptage de cartes possible.

## Réutilisation de code

Tous les contrats de ce dépôt sont écrits pour ce projet. `pcaversaccio/solidity-games`
(WTFPL) a été évalué comme base pour Roulette et Blackjack mais n'a pas été utilisé :
l'architecture par `bytes32` de siège plutôt que par `msg.sender` — imposée par le wallet
unique — rendait l'adaptation plus longue que l'écriture directe.

Dépendances : `forge-std` (tests), `viem` (RPC), `next` / `react` / `tailwind` (front),
`qrcode.react` (QR de la table).

## Faire tourner le projet

```bash
# Contrats
cd contracts
forge test                     # 54 tests
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz/ \
  --chain 10143 --account <votre-keystore> --broadcast

# Front
cd web
cp .env.example .env.local     # y coller les adresses affichées par le script
npm install
npm run dev
```

La table s'ouvre sur `/`, la vue téléphone sur `/play` (accessible par le QR code affiché sur
la table).

## Démo

Une table live à 4-5 places : le public scanne, mise depuis son téléphone, et tout le monde
vole sur le même tour d'Aviator en même temps. Le classement se met à jour en direct depuis
les events on-chain.
