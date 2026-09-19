# MONAD_ANALYSIS.md

> Restitution complète de l'exploration de la documentation officielle Monad
> (https://docs.monad.xyz, intégralité du site parcourue le 19 septembre 2026)
> réalisée en amont du développement de BlitzBet.
>
> Ce document existe parce que la connaissance qu'il contient n'est récupérable
> nulle part ailleurs sans refaire l'exploration complète. Il est volontairement
> exhaustif plutôt que filtré : certaines sections n'ont pas d'usage immédiat
> pour BlitzBet mais pourraient en avoir un si le périmètre bouge.
>
> **Convention de lecture** : les passages marqués ⚠️ signalent un piège capable
> de casser le projet en démo. Les passages marqués 💡 signalent une propriété
> exploitable comme argument de pitch.

---

## 1. Identité réseau et points d'accès

### 1.1 Paramètres

|                    | Mainnet                     | Testnet (celui du projet)      |
| ------------------ | --------------------------- | ------------------------------ |
| Chain ID           | `143` (`0x8F`)              | `10143` (`0x279F`)             |
| Devise             | MON, 18 décimales           | MON, 18 décimales              |
| RPC public         | `https://rpc.monad.xyz`     | `https://testnet-rpc.monad.xyz`|
| WebSocket          | `wss://rpc.monad.xyz`       | `wss://testnet-rpc.monad.xyz`  |
| Faucet             | —                           | `https://faucet.monad.xyz`     |
| App hub            | `https://app.monad.xyz`     | `https://testnet.monad.xyz`    |

Le mainnet public a été lancé le 24 novembre 2025. Le testnet a subi un
**re-genesis le 16 décembre 2025** (release v0.12.5) : toute adresse de contrat
ou tout tutoriel antérieur à cette date est obsolète. C'est une source classique
de confusion quand on trouve de vieux articles de blog.

### 1.2 ⚠️ Explorateurs — divergence à connaître

La consigne du projet mentionne `https://testnet.monadexplorer.com/`. La
documentation officielle actuelle ne référence plus cette URL et liste
exclusivement :

- **MonadVision** (par BlockVision) — `https://testnet.monadvision.com`
- **Monadscan** (par Etherscan) — `https://testnet.monadscan.com`

`monadexplorer.com` correspond à l'ancienne dénomination de l'explorateur testnet.
Conserver la valeur demandée dans la config wallet si elle fonctionne, mais
**utiliser monadvision/monadscan pour vérifier les déploiements et partager des
liens de transaction en démo** — ce sont ceux que la doc considère canoniques et
ceux que l'audience reconnaîtra.

Autres explorateurs supportés : Phalcon Explorer (BlockSec) et Tenderly pour les
traces détaillées, Jiffyscan pour les UserOps ERC-4337.

### 1.3 RPC publics testnet et leurs limites

| URL | Fournisseur | Rate limit | Batch | Archive |
| --- | --- | --- | --- | --- |
| `testnet-rpc.monad.xyz` | QuickNode | 50 rps (**25 rps** pour `eth_call` et `eth_estimateGas`) | 100 | ✅ |
| `rpc.ankr.com/monad_testnet` | Ankr | 300 req/10 s, 12 000 req/10 min | 100 | ❌ (`debug_*` interdits) |
| `rpc-testnet.monadinfra.com` | Monad Foundation | 20 rps | **aucun batch** | ✅ |

⚠️ **Le plafond de 25 rps sur `eth_call` est le premier mur qu'un front de casino
va rencontrer.** Une table à 5 joueurs qui rafraîchit soldes, état de partie et
leaderboard en polling atteint ce plafond trivialement. La parade est architecturale
(voir §9) : passer par les WebSockets et par un state local plutôt que par du polling.

Prévoir un basculement de RPC en cas de dégradation pendant la démo : garder les
trois URLs dans la config, avec un fallback automatique.

---

## 2. Performances et ce qu'elles impliquent concrètement

| Métrique | Valeur | Source |
| --- | --- | --- |
| Débit | 10 000+ TPS (capacité de design) | doc |
| Temps de bloc | **300 ms** (moyenne observée ~302 ms) | mesuré mainnet |
| Finalité spéculative | 300 ms (1 slot, état `Voted`) | garantie protocole |
| Finalité complète | 600 ms (2 slots) | garantie protocole |
| État `Verified` (state root) | +3 blocs après `Finalized` (soit T+5) | doc |
| Gas limit par bloc | 150M | mesuré mainnet |
| Cible de remplissage | 80 % = 120M gas | doc |
| Débit gas | 500M gas/s | 150M ÷ 0,3 s |
| Gas limit par transaction | 30M | paramètre protocole |
| Transactions max par bloc | ~3 750 | doc |
| Validateurs actifs | 200 | `ACTIVE_VALSET_SIZE` |

💡 **Comparaison Ethereum, à avoir en tête pour le pitch** : ~10 TPS, 12 s de bloc,
finalité en 2 époques (12 à 18 minutes). Le facteur sur le temps de bloc est de 40×,
sur la finalité de l'ordre de 1 000 à 1 800×.

Ce qui rend ces chiffres intéressants pour un projet de jeu, ce n'est pas le TPS
— aucune démo de hackathon n'en a besoin — mais le **temps de bloc**. À 300 ms, un
bloc devient une unité de temps perceptible par un humain mais pas frustrante.
C'est ce qui permet des mécaniques qui seraient injouables ailleurs : une manche
par bloc, ou un commit-reveal dont l'attente est invisible.

---

## 3. Consensus, états de bloc et finalité

### 3.1 MonadBFT

Consensus BFT pipeliné, dérivé de la famille HotStuff, résolvant le problème du
**tail-forking** (un leader qui forke le bloc de son prédécesseur pour en capturer
la valeur). Complexité de messages linéaire sur le chemin nominal. Papier de
référence : arxiv.org/abs/2502.20692.

Notions utiles : **QC** (Quorum Certificate — supermajorité de votes agrégés sur
une proposition), **TC** (Timeout Certificate), **high_tip** (la proposition valide
de plus haut round observée), **No-Endorsement Certificate** (preuve qu'un bloc
n'est pas supporté, ce qui autorise à ne pas le reproposer).

Authentification : signatures **BLS12-381 agrégeables** pour les votes et timeouts,
**ECDSA secp256k1** pour le reste. Le choix hybride vient du fait que BLS est plus
lent à vérifier mais agrégeable, ce qui compte pour les messages présents dans
chaque certificat.

### 3.2 Les quatre états d'un bloc

C'est le point d'architecture le plus important à comprendre pour construire une
UI réactive sur Monad.

| État | Tag JSON-RPC | Signification | Délai |
| --- | --- | --- | --- |
| `Proposed` | `latest` | Le leader a proposé le bloc. Exécution spéculative possible. Aucune garantie de consensus. | T+0 |
| `Voted` | `safe` | QC obtenu, supermajorité a voté. Réversible seulement dans des conditions extrêmement improbables. | T+1 (300 ms) |
| `Finalized` | `finalized` | QC² en main. Irréversible sans hard fork. | T+2 (600 ms) |
| `Verified` | — | Le merkle root retardé a été finalisé : la supermajorité confirme le **résultat d'exécution**. | T+5 |

⚠️ **Piège majeur, spécifique à Monad** : le tag `latest` pointe sur `Proposed`,
pas sur `Finalized`. Ce comportement a changé au hard fork MONAD_NINE (v0.13.0).
Un code écrit pour Ethereum qui suppose que `latest` est acquis lira donc de l'état
**spéculatif**. Pour une application qui paie de l'argent, cette distinction n'est
pas cosmétique.

**Recommandation de la doc pour une app grand public** : mettre à jour l'UI dès
`Proposed`, parce qu'un retour de finalité spéculative est extrêmement rare. Attendre
`Finalized` est l'option conservatrice qui évite d'avoir à gérer un reorg. Attendre
`Verified` n'est nécessaire que pour de la logique financière hors-chaîne (ponts,
émetteurs de stablecoins, exchanges).

💡 **Pour BlitzBet, c'est un angle de pitch exploitable** : afficher le résultat
d'une partie dès `Proposed` (ressenti instantané) tout en montrant à l'écran la
progression `Proposed → Voted → Finalized`. L'utilisateur voit le gain immédiatement
*et* voit la chaîne le confirmer en 600 ms. Aucune app centralisée ne peut montrer ça,
et aucune app Ethereum ne peut le faire en moins de 24 secondes.

### 3.3 RaptorCast

Protocole de diffusion des blocs par codes à effacement (codes Raptor, RFC 5053),
arbre de broadcast à deux niveaux, sur UDP. Un bloc de 2 Mo devient ~4 100 chunks
avec un facteur de redondance de 2,5, répartis proportionnellement au stake.
Un « Secondary RaptorCast » permet aux validateurs de relayer vers les full nodes
(~15 000 full nodes supportés ; ~6 Mo/s à 10 000 TPS).

Sans impact direct sur BlitzBet, mais c'est la réponse à « comment tenez-vous
300 ms de bloc avec 200 validateurs répartis mondialement ».

### 3.4 Mempool local — pas de mempool global

⚠️ Monad **n'a pas de mempool global**. Chaque validateur maintient un mempool
local. Quand un nœud RPC reçoit une transaction, il la transmet aux **3 prochains
leaders**, et répète l'opération jusqu'à **3 fois** s'il ne voit pas la transaction
incluse.

Conséquences pratiques :
- `txpool_content` et la souscription `newPendingTransactions` **n'existent pas**.
- Pour suivre l'état d'une transaction en attente, il faut soit tracker les nonces
  localement, soit utiliser les méthodes Monad `txpool_statusByAddress` /
  `txpool_statusByHash`.
- Les nonce gaps sont tolérés : un EOA au nonce 0 qui envoie le nonce 3 puis les
  nonces 0, 1, 2 verra bien la transaction nonce 3 s'exécuter, pas être rejetée.

---

## 4. Exécution asynchrone et Reserve Balance

C'est la partie de l'architecture Monad qui a le plus de conséquences non évidentes
sur une application qui envoie beaucoup de transactions depuis une seule adresse —
exactement le cas de BlitzBet.

### 4.1 Le principe

Monad découple consensus et exécution : **les nœuds se mettent d'accord sur l'ordre
des transactions avant de les exécuter**. Le consensus sur le bloc `n` ne requiert
que l'état obtenu après exécution du bloc `n-k`, avec **k = 3** (aussi noté `D` dans
la doc).

L'intérêt : sur Ethereum, l'exécution doit tenir dans une fraction du temps de bloc
(~100 ms pour 30M de gas sur un bloc de 12 s, soit 1 % du budget). Sur Monad,
l'exécution dispose du temps de bloc entier puisqu'elle se déroule en parallèle du
consensus sur les blocs suivants.

Le bloc embarque un **merkle root retardé** de 3 blocs, qui permet de vérifier a
posteriori que tout le monde a calculé le même état.

### 4.2 Reserve Balance — le mécanisme, et pourquoi il vous concerne

Puisque le consensus travaille sur une vue de l'état vieille de 3 blocs, il ne peut
pas savoir si un compte a encore de quoi payer le gas. Monad résout ça avec la
**Reserve Balance**, fixée à **10 MON** pour tous les comptes.

Les dépenses d'un EOA sont partitionnées en deux :
- **gas spend** = `gas_price × gas_limit`
- **value spend** = le champ `value` de la transaction

Règles :
- **Au consensus** : pour chaque compte, le budget de *gas spend* cumulé de toutes
  les transactions « inflight » (incluses il y a moins de k=3 blocs) est plafonné à
  `min(10 MON, solde à l'état retardé)`. Au-delà, les transactions sont **exclues**.
- **À l'exécution** : une transaction revert si le solde final du compte (avant
  refunds) passe sous 10 MON, sauf exception.
- **Exception « emptying transaction »** : autorisée si l'expéditeur n'est pas
  délégué EIP-7702, n'a envoyé **aucune autre transaction dans les 3 derniers blocs**,
  et n'a fait l'objet d'aucune demande de (dé)délégation sur la même fenêtre.

⚠️ **Impact direct sur l'architecture « wallet unique qui signe pour tous les
joueurs »** :

1. **L'exception emptying ne s'applique qu'une fois toutes les ~1,2 seconde.** Un
   wallet qui envoie des transactions en rafale n'en bénéficie jamais. Il doit donc
   **rester au-dessus de 10 MON en permanence**, avec de la marge.

2. **Plafond de transactions simultanées.** Avec un gas limit de 200 000 et une base
   fee au plancher de 100 gwei, chaque transaction consomme 0,02 MON de budget. Le
   budget étant de 10 MON, cela autorise ~500 transactions inflight sur une fenêtre
   de 1,2 s. Une table à 5 joueurs est très loin de ce plafond — mais si le wallet
   descend à 1 MON de solde, le budget tombe à 1 MON, soit ~50 transactions, et une
   rafale peut commencer à voir des transactions **exclues silencieusement**.

3. **Règle de sécurité opérationnelle : maintenir le wallet du projet largement
   au-dessus de 10 MON** (viser 50 MON ou plus via le faucet). Si le solde approche
   10 MON en pleine démo, les transactions commencent à échouer de façon difficile
   à diagnostiquer.

4. **Après un financement, attendre k=3 blocs (~1,2 s)** avant de dépenser les fonds
   reçus. La doc le mentionne explicitement pour les wallets.

Un précompile permet de détecter la situation : `0x1001`, méthode
`dippedIntoReserve()`, sélecteur `0x3a61584e`, coût 100 gas, à appeler via `CALL`
(un `STATICCALL`, `DELEGATECALL` ou `CALLCODE` revert). Spécifié dans MIP-4.

### 4.3 ⚠️ Transactions incluses mais revertées

Une conséquence visible de ce mécanisme : la chaîne contient des transactions
**incluses puis revertées** parce qu'elles tentaient de dépenser plus de MON que
le solde réel. Elles paient le gas et ne produisent aucun autre effet. Ce n'est pas
une anomalie et ce n'est pas propre à Monad (Ethereum inclut aussi des transactions
qui revert), mais les block builders Ethereum filtrent souvent ces cas, donc le
comportement surprend.

**Pour la démo** : ne jamais interpréter « transaction incluse » comme « partie
gagnée ». Toujours lire le receipt et vérifier le status.

### 4.4 Gestion des nonces — le vrai point dur de l'architecture wallet unique

⚠️ **C'est le risque technique n°1 de BlitzBet tel qu'architecturé.**

Un wallet unique qui signe pour 5 joueurs simultanés produit des transactions
concurrentes sur un **espace de nonces séquentiel unique**. La doc est explicite :
`eth_getTransactionCount` nécessite un aller-retour réseau, et si plusieurs
transactions partent du même wallet en succession rapide, **il faut impérativement
tracker les nonces localement**.

Sans cela, deux joueurs qui cliquent en même temps obtiennent le même nonce : une
transaction écrase l'autre, ou les deux échouent. Sur Aviator, où par construction
tous les joueurs agissent dans la même fenêtre de temps, **ce cas n'est pas un cas
limite, c'est le cas nominal**.

La doc recommande également de **soumettre les transactions concurremment plutôt
que séquentiellement** (voir §8.4), ce qui rend la gestion locale des nonces encore
plus nécessaire.

Architecture à mettre en place côté backend :
- un compteur de nonce en mémoire, initialisé une fois au démarrage via
  `eth_getTransactionCount`, puis incrémenté localement à chaque envoi ;
- une file d'attente sérialisant l'attribution des nonces (un mutex suffit) ;
- une resynchronisation sur `eth_getTransactionCount` en cas d'erreur ;
- surtout pas un appel à `eth_getTransactionCount` avant chaque transaction : c'est
  à la fois lent et faux en situation de concurrence.

---

## 5. Randomness on-chain — analyse complète

C'est le cœur technique d'un projet de casino, et la section où le plus
d'alternatives ont été envisagées puis écartées.

### 5.1 Ce que Monad fournit

Monad ne propose **pas** de source de randomness native au protocole. Les opcodes
classiques restent disponibles avec la sémantique EVM standard :
`BLOCKHASH` (256 derniers blocs), `PREVRANDAO`, `TIMESTAMP`, `NUMBER`.

⚠️ **`BLOCKHASH` n'est disponible que pour les 256 derniers blocs.** À 300 ms par
bloc, cela représente **~76 secondes de fenêtre**, contre ~51 minutes sur Ethereum.
Toute logique qui référence un blockhash passé doit être résolue **dans les
76 secondes**, sinon `blockhash()` renvoie `0x0` et la logique casse silencieusement
(et un hash nul est une valeur de randomness catastrophique : prévisible et
identique pour tout le monde).

⚠️ **`TIMESTAMP` est en secondes.** Comme les blocs tombent toutes les 300 ms,
**3 à 4 blocs consécutifs partagent exactement le même timestamp**. Toute logique
qui utilise `block.timestamp` comme horloge fine est cassée sur Monad.

💡 **Implication directe pour Aviator** : le multiplicateur doit être une fonction
de `block.number`, **pas** de `block.timestamp`. `block.number` donne une résolution
de 300 ms, `block.timestamp` une résolution de 1 seconde avec des paliers de 3-4
blocs. Utiliser `block.number` donne une courbe fluide *et* c'est un argument de
pitch : le multiplicateur d'Aviator est littéralement indexé sur le rythme de la
chaîne.

### 5.2 L'attaque à connaître (même si elle est acceptée)

La décision projet est d'aller au plus rapide sur la randomness. C'est un arbitrage
légitime pour un hackathon, mais il faut savoir précisément ce qu'on accepte.

Si le résultat est dérivé d'une valeur **lisible dans la transaction qui la
consomme** (`blockhash(block.number - 1)`, `block.timestamp`, `block.prevrandao`),
alors un contrat attaquant peut :

```
function attaque() external {
    uint256 avant = address(this).balance;
    casino.jouer{value: mise}(pari);
    require(address(this).balance > avant);  // revert si perdu
}
```

Le `require` annule toute la transaction en cas de perte. L'attaquant ne paie que
le gas et ne perd jamais sa mise. C'est une dizaine de lignes de Solidity.

**Mitigation retenue (coût : une ligne)** : `require(msg.sender == tx.origin)` sur
les fonctions de jeu. Un contrat ne peut alors pas appeler le casino, ce qui ferme
ce vecteur précis.

Limites honnêtes de cette mitigation, à documenter dans le README :
- elle ne protège pas contre un **validateur** qui choisit d'inclure ou non un bloc ;
- elle casse la compatibilité avec les smart accounts (ERC-4337, EIP-7702), ce qui
  est sans conséquence ici puisqu'un wallet unique signe tout ;
- elle est considérée comme un anti-pattern en production. C'est acceptable pour
  une démo testnet sans valeur réelle, et il faut le dire plutôt que le masquer.

### 5.3 Alternative envisagée puis écartée : commit-reveal sur `N+2`

**Le mécanisme** : le joueur mise au bloc N (commit). Le résultat est dérivé de
`blockhash(N+2)`, inconnu au moment de la mise. Une seconde transaction (`settle`)
révèle le résultat, appelable par n'importe qui, avec expiration et remboursement
si personne ne règle dans les 256 blocs.

**Pourquoi c'était séduisant** : 2 blocs sur Monad = **600 ms**. Le même mécanisme
coûte 24 secondes sur Ethereum, ce qui le rend inutilisable pour du jeu — et c'est
précisément pour ça que les casinos on-chain existants trichent avec du same-block.
L'argument de pitch était : *« la fairness vérifiable n'était pas compatible avec
une UX de jeu ; elle le devient à 300 ms »*.

**Pourquoi c'est écarté** : décision projet d'aller au plus rapide, et le coût réel
n'est pas nul — deux transactions par partie au lieu d'une, donc deux fois plus de
pression sur la gestion des nonces (§4.4), et une machine à états à gérer côté front.

💡 **Exception à reconsidérer si le temps le permet : la Roulette.** L'animation de
la roue dure 2 à 3 secondes, ce qui **couvre largement les 600 ms** du commit-reveal.
Le délai serait donc entièrement masqué par l'animation, pour un coût UX strictement
nul. Si un seul jeu doit être « provably fair », c'est celui-là — et ça donne un
argument de pitch solide sans rien coûter à l'expérience. À arbitrer selon le temps
restant.

### 5.4 Alternative envisagée puis écartée : Pyth Entropy

**Disponible sur le testnet Monad** :
- Entropy : `0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320`
- Price feeds : `0x2880aB155794e7179c9eE2e38200202908C17B43`

C'est un VRF réel, avec une vraie garantie cryptographique. **Écarté** parce que le
modèle est en callback asynchrone : la requête part, le résultat revient dans une
transaction ultérieure, avec une latence de l'ordre de la seconde et une dépendance
à un keeper externe. Cela casse l'effet « résultat instantané » qui est le cœur de
la démonstration, et ajoute un point de défaillance externe pendant une démo live.

À mentionner dans le README comme **chemin de production** : c'est la réponse
honnête à la question « et en vrai, vous feriez comment ? », qui sera posée.

### 5.5 Autres oracles VRF disponibles sur Monad

Pour référence si le sujet revient :
- **Pyth Entropy** (adresses ci-dessus)
- **Supra dVRF** — testnet : storage `0xf0e852BC3F940447862D6b67e5B9807E64B433F6`,
  pull `0xF8522B7fcE37439b98A2be282d413A44269028bE`,
  router `0x5CbC3Dfa33223884E7752a833Fa6aD28Ee015FC4`,
  deposit `0x95bfe6e94D5ff9e9d087647bc589acC9E3D31619`
- **Switchboard** — randomness vérifiable, testnet `0x33A5066f65f66161bEb3f827A3e40fce7d7A2e6C`,
  mainnet `0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67`
- **Gelato VRF** — supporté sur testnet
- **Chainlink** — Data Feeds et Data Streams présents, mais la doc ne mentionne pas
  VRF sur Monad

### 5.6 Recommandation de formulation pour le pitch

Ne pas présenter le MVP comme « provably fair » sans qualificatif — c'est
factuellement faux avec un tirage same-block, et il y aura des gens dans la salle
capables de le voir en dix secondes. La formulation honnête et défendable :

> « Le MVP utilise un tirage dérivé du blockhash, avec une garde anti-contrat.
> C'est suffisant pour une démo testnet sans valeur réelle, et ça ne l'est pas pour
> de la production — le chemin production, c'est Pyth Entropy, déjà déployé sur
> Monad, ou un commit-reveal sur deux blocs qui ne coûte que 600 ms ici contre
> 24 secondes sur Ethereum. »

Cette réponse transforme une faiblesse en démonstration de maîtrise du sujet.
C'est aussi, en pratique, ce que les juges d'un hackathon technique valorisent.

---

## 6. Gas et coûts — la particularité la plus structurante de Monad

### 6.1 ⚠️ Monad facture le `gas_limit`, pas le `gas_used`

C'est **la** différence Monad qui coûte de l'argent si on l'ignore :

```
total débité = value + gas_price × gas_limit
```

Ce n'est pas `gas_used`. La raison est une protection anti-DoS liée à l'exécution
asynchrone : les leaders construisent les blocs avant d'exécuter, donc un attaquant
pourrait réserver de l'espace de bloc avec un gas limit énorme et une consommation
réelle minuscule.

**Conséquences pour BlitzBet** :

1. **Fixer le gas limit en dur pour chaque fonction de jeu.** Les coûts sont connus
   et stables (un coinflip est un coinflip). La doc recommande explicitement cette
   pratique. Elle supprime un aller-retour `eth_estimateGas` (donc de la latence
   visible) et évite le piège suivant.

2. ⚠️ **Le piège MetaMask.** Quand `eth_estimateGas` revert, plusieurs wallets dont
   MetaMask positionnent un gas limit **très élevé** en dernier recours. Sur Ethereum
   c'est sans conséquence puisqu'on paie le gas utilisé. Sur Monad, **cela facture
   effectivement ce montant**. Or un `eth_estimateGas` revert précisément dans les
   cas d'erreur métier — mise trop élevée, round fermé, bankroll insuffisante.
   Autrement dit : c'est au moment où le joueur fait une erreur qu'il risque de
   payer le plus cher. Raison de plus pour fixer les gas limits en dur.

3. **Marge recommandée par la doc : +7,5 %** (10 750 basis points), pas le
   1,5× à 2× habituel sur Ethereum. Category Labs a publié l'analyse qui sous-tend
   ce chiffre. Sur-provisionner ici coûte réellement.

### 6.2 Base fee et EIP-1559

- **Base fee minimum : 100 MON-gwei** (100 × 10⁻⁹ MON)
- EIP-1559 standard : `price_per_gas = min(base_fee + priority_fee, max_fee)`
- Le contrôleur de base fee monte **plus lentement** et descend **plus vite** que
  celui d'Ethereum, pour éviter la sous-utilisation de l'espace de bloc.
  Paramètres : `max_step_size = 1/28`, `target = 160M` (80 %), `β = 0,96`, `ε = target`.

### 6.3 Coûts concrets

| Opération | Gas | Coût MON | Coût USD approx. |
| --- | --- | --- | --- |
| Transfert natif | 21 000 | 0,0021 | ~0,00005 $ |
| Transfert ERC-20 | ~65 000 | ~0,0065 | ~0,00016 $ |
| Swap DEX typique | ~200 000 | ~0,02 | ~0,0005 $ |

💡 **Argument de pitch** : une partie de coinflip coûte une fraction de centime.
Le modèle économique d'un micro-pari on-chain devient viable, ce qui n'est pas le
cas sur un L1 où chaque interaction coûte plusieurs dizaines de centimes.

Cela permet aussi de dimensionner la trésorerie de la démo : 50 MON couvrent
plusieurs milliers de parties, très largement au-delà de ce qu'une démo consommera.

### 6.4 ⚠️ `eth_maxPriorityFeePerGas` renvoie une valeur codée en dur

La méthode renvoie **2 gwei en dur**. Ce n'est **pas** une recommandation calculée
à partir de l'état du réseau. Un front qui s'en sert comme d'une estimation
dynamique se trompe.

De même, `eth_feeHistory` appelé avec `newest_block = latest` **duplique le dernier
`baseFeePerGas`** (le protocole renvoie par convention une projection du bloc
suivant, que Monad ne peut pas calculer). Ne pas le compter deux fois dans une
moyenne ou un graphique.

---

## 7. Repricing des opcodes et modèle de stockage

Monad conserve la tarification Ethereum sauf sur quelques points, réajustés à la
hausse pour refléter la rareté relative réelle des ressources après optimisation.
La philosophie annoncée : plutôt que de baisser le prix de presque tous les opcodes,
en augmenter quelques-uns, ce qui produit le même effet relatif.

| Élément | Ethereum | Monad |
| --- | --- | --- |
| Cold access compte | 2 600 | **10 100** |
| Cold access storage | 2 100 / slot | **8 100 / page de 128 slots** |
| Expansion mémoire | `3w + w²/512` | **`w/2`**, plafond 8 Mo/tx |
| `ecRecover` (`0x01`) | 3 000 | 6 000 (×2) |
| `ecAdd` (`0x06`) | 150 | 300 (×2) |
| `ecMul` (`0x07`) | 6 000 | 30 000 (×5) |
| `ecPairing` (`0x08`) | 45k + 34k/pt | 225k + 170k/pt (×5) |
| `blake2f` (`0x09`) | rounds × 1 | rounds × 2 |
| `point_eval` (`0x0a`) | 50 000 | 200 000 (×4) |
| Warm access | 100 | 100 (inchangé) |

### 7.1 💡 Stockage par pages (MIP-8) — à exploiter dans la conception des contrats

C'est une spécificité Monad avec un impact direct et positif sur le design des
structures de données.

Les slots de stockage sont regroupés en **pages de 128 slots consécutifs**
(`page_index = slot >> 7`). Le coût « cold » se paie **une fois par page**, pas par
slot. Une fois qu'un slot d'une page a été touché, **tous les autres slots de cette
page sont « warm »** pour le reste de la transaction.

Détail de `SSTORE` (composants cumulables) :

| Composant | Gas | Quand |
| --- | --- | --- |
| Base | 100 | à chaque `SSTORE` |
| Page load | 8 000 | premier accès à la page (lecture ou écriture) |
| Page write | 2 800 | premier `SSTORE` modifiant une valeur de la page |
| State growth | 17 000 | quand le nombre net de slots de la page atteint un nouveau maximum |

`SLOAD` : 8 100 au premier accès à la page, **100 ensuite**.

Exemples comparés fournis par la doc :

| Séquence | Avant MIP-8 | Avec MIP-8 |
| --- | --- | --- |
| `SLOAD` d'un slot, premier accès à sa page | 8 100 | 8 100 |
| `SLOAD` d'un autre slot de la **même page** | 8 100 | **100** |
| `SSTORE` slot neuf, page déjà écrite | 28 100 | **17 100** |
| `SSTORE` sur slot non-nul, page déjà écrite | 11 000 | **100** |

**Implication concrète pour les contrats BlitzBet** : regrouper les variables lues
ou écrites ensemble dans des **slots consécutifs**. Solidity le fait naturellement
pour les variables d'état déclarées à la suite, pour les champs d'un `struct` et
pour les éléments d'un tableau. En revanche, **chaque clé d'un `mapping` atterrit
sur sa propre page**.

Pour le leaderboard et l'état des rounds, cela oriente vers : un `struct` compact
par round (tous les champs sur la même page), et un tableau plutôt qu'un mapping
quand les index sont denses. Un `mapping(address => uint256)` de scores paiera
8 100 gas par joueur touché ; un `struct Player` avec plusieurs champs ne paiera
ce coût qu'une fois pour l'ensemble des champs.

Les entrées d'access list EIP-2930 réchauffent **toute la page** contenant la clé
listée, et `eth_createAccessList` déduplique les clés par page.

### 7.2 Autres différences EVM

- **Taille max d'un contrat : 128 Ko** (contre 24,5 Ko), init code 256 Ko (contre 48 Ko).
  Confortable : aucune contrainte de taille à prévoir, même en mettant les quatre
  jeux dans un contrat unique.
- **Mémoire linéaire** : `w/2` au lieu de `3w + w²/512`, plafond **8 Mo par
  transaction** (atteindre le plafond coûte 131 072 gas). Les manipulations mémoire
  lourdes sont bien moins chères que sur Ethereum.
- **Transaction type 3 (EIP-4844, blobs) non supportée.** Types supportés : 0
  (legacy), 1 (EIP-2930), 2 (EIP-1559), 4 (EIP-7702).
- Compatibilité EVM au niveau du fork **Fusaka**. Tous les opcodes de ce fork sont
  supportés.
- Les transactions pré-EIP-155 (sans chain id) restent autorisées au niveau
  protocole, comme sur la plupart des chaînes EVM. Corollaire : déconseillé
  d'envoyer des fonds vers une adresse Ethereum ayant déjà émis des transactions
  pré-EIP-155.

### 7.3 Précompiles

Tous les précompiles Ethereum du fork Fusaka (`0x01` à `0x11`), y compris BLS12-381
(`0x0b` à `0x11`), plus trois spécifiques à Monad :

| Adresse | Rôle | Coût |
| --- | --- | --- |
| `0x0100` | Vérification P256 / secp256r1 (EIP-7951) | 6 900 gas |
| `0x1000` | Staking | variable |
| `0x1001` | Reserve balance (`dippedIntoReserve()`) | 100 gas |

Le précompile **P256** mérite d'être connu : il permet de vérifier des signatures
WebAuthn / passkey **on-chain**. C'est la brique qui rend possible un onboarding
sans seed phrase (Face ID / Touch ID). Format d'entrée : exactement 160 octets
(`hash`, `r`, `s`, `qx`, `qy`, 32 octets chacun, big-endian). Retourne
`0x…01` si valide, bytes vides sinon.

💡 Non utilisé dans le MVP (wallet unique), mais c'est **la** réponse à « comment
onboarder le public sans wallet ? » si la question est posée en pitch. La librairie
Mera (Category Labs, open source) fait exactement ça : dérivation de comptes EVM
BIP-44 depuis une passkey via l'extension WebAuthn PRF, sans seed phrase et sans
custody serveur.

---

## 8. Outillage — ce qui diffère d'un projet Ethereum

### 8.1 Foundry

⚠️ **Il faut Foundry v1.8.0 ou supérieur.** Les versions antérieures n'ont pas le
support de l'exécution Monad. Vérifier avec `forge --version`.

Configuration dans `foundry.toml` :

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
network = "monad"                            # exécution Monad en local
eth-rpc-url = "https://testnet-rpc.monad.xyz"
chain_id = 10143
```

`network = "monad"` fait utiliser par Forge, Cast et Chisel le modèle de gas Monad,
la tarification des opcodes, les règles de transaction, les précompiles et les
limites de taille de contrat — **en local**, donc `forge test` reflète le
comportement réel on-chain. Équivalent ponctuel : `forge test --network monad`.

Sélection du hardfork : par défaut le plus récent supporté (`MonadTen`). Pour
reproduire un fork antérieur : `hardfork = "monad:MonadNine"` ou
`--hardfork MonadNine`. En cas de fork d'un endpoint Monad, Foundry détecte
automatiquement le hardfork actif à partir du chain ID et du timestamp du bloc.

Anvil local avec l'environnement Monad : `anvil --network monad` (défaut `MonadTen`).
Fork du testnet : `anvil --fork-url https://testnet-rpc.monad.xyz`.

⚠️ **Le fork historique `category-labs/foundry` (branche `monad`) est obsolète.**
Il ne supporte l'exécution Monad que jusqu'au hardfork `MonadNine` et ne connaît
ni `MonadTen` ni MIP-8. Si une ancienne installation traîne sur la machine, migrer :
installer Foundry officiel v1.8+, ajouter `network = "monad"`, remplacer
`anvil --monad` par `anvil --network monad`, et retirer tout script installant
depuis `foundry.category.xyz`.

CI : utiliser `foundry-rs/foundry-toolchain@v1` avec `version: v1.8.0`
(et non `category-labs/foundry-toolchain@v1`).

### 8.2 Hardhat (si jamais utilisé)

`evmVersion: "prague"` dans les settings du compilateur Solidity. Les templates
officiels récents (`hardhat3-monad`) utilisent `"osaka"` avec solidity 0.8.31.
Templates disponibles : `monad-developers/hardhat-monad` et `hardhat3-monad`.

### 8.3 Versions de librairies

- **`viem >= 2.40.0`** — nécessaire pour embarquer la définition de chaîne Monad
  (`monad.ts` dans les chains viem). En dessous, il faut définir la chaîne à la main.
- **`alloy-chains >= 0.2.20`** côté Rust.
- Templates Foundry : `monad-developers/foundry-monad` (préconfiguré testnet).

### 8.4 💡 Bonnes pratiques de performance recommandées par la doc

Ces recommandations viennent directement de la page « Best Practices » et sont
très pertinentes pour une table multi-joueurs :

1. **Ne pas appeler `eth_estimateGas` quand le coût est connu.** Gas limit en dur.
   Supprime un aller-retour réseau dans le chemin critique de l'UX.

2. **Regrouper les lectures en un seul appel.** `Multicall3` est déployé à
   `0xcA11bde05977b3631167028862bE2a173976CA11` sur mainnet **et** testnet.
   Attention : Multicall exécute les appels **séquentiellement** côté contrat — il
   évite les allers-retours réseau mais ne parallélise pas le calcul. Pour des
   appels coûteux, un **batch JSON-RPC** est meilleur car le RPC peut les traiter
   en parallèle.

3. **Soumettre les transactions concurremment, pas séquentiellement.** La doc donne
   l'exemple explicite avec `viem` : construire un tableau de promesses et faire
   `Promise.all()` plutôt qu'une boucle `await`. `viem` regroupe alors les requêtes
   en un seul batch. Combiné à la gestion locale des nonces (§4.4), c'est le bon
   pattern pour Aviator où 5 joueurs cashent out quasi simultanément.

4. **Gérer les nonces localement** en cas d'envois rapprochés depuis un même wallet.

5. **Utiliser un indexer plutôt que du `eth_getLogs` répété** pour les charges de
   lecture historiques.

### 8.5 Vérification de contrats

Trois cibles possibles sur testnet (`--chain 10143`) :

```bash
# MonadVision (Sourcify)
forge verify-contract <addr> <Name> --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/

# Monadscan (Etherscan)
forge verify-contract <addr> <Name> --chain 10143 \
  --verifier etherscan --etherscan-api-key <KEY> --watch

# Socialscan
forge verify-contract <addr> <Name> --chain 10143 --watch \
  --etherscan-api-key <KEY> --verifier etherscan \
  --verifier-url https://api.socialscan.io/monad-testnet/v1/explorer/command_api/contract
```

Pour la vérification Sourcify avec un projet Foundry standard, ajouter dans
`foundry.toml` : `metadata = true`, `metadata_hash = "none"` (désactive IPFS),
`use_literal_content = true`.

💡 **Vérifier les contrats a une valeur de pitch directe** : sur un projet de jeu
d'argent, « le contrat est vérifié, allez lire le code » est l'argument central de
crédibilité. Cela prend deux minutes et différencie immédiatement d'un casino
classique opaque. À faire même si le temps manque.

---

## 9. JSON-RPC — pièges spécifiques à Monad

### 9.1 ⚠️ `eth_getLogs` : 100 blocs = 30 secondes d'historique

**Le piège le plus dangereux pour le leaderboard de BlitzBet.**

| Fournisseur | RPC | Limite de plage |
| --- | --- | --- |
| QuickNode | `rpc.monad.xyz` | **100 blocs** |
| Alchemy | `rpc1.monad.xyz` | 1 000 blocs et 10 000 logs |
| Ankr | `rpc3.monad.xyz` | 1 000 blocs |
| Monad Foundation | `rpc-mainnet.monadinfra.com` | **100 blocs** |

À 300 ms par bloc, **100 blocs = 30 secondes**. Un leaderboard qui tenterait de
reconstruire l'historique de la démo en interrogeant les logs échouera dès que la
démo dépassera trente secondes.

La doc justifie ces limites basses : Monad produit un bloc toutes les 300 ms avec
jusqu'à 3 750 transactions et 150M de gas par bloc — les blocs sont à la fois
beaucoup plus fréquents et beaucoup plus gros que sur Ethereum.

**Trois parades, par ordre de préférence pour ce projet** :

1. **Maintenir le leaderboard dans le state du contrat** (un `struct` par joueur,
   un tableau de scores). Une seule lecture `eth_call` donne le classement complet.
   C'est robuste, simple, et cohérent avec le modèle de pages de stockage (§7.1).
   **C'est la solution recommandée ici.**
2. **Souscrire aux events en WebSocket** (`logs` / `monadLogs`) et accumuler côté
   client depuis le début de la démo. Fonctionne, mais un rechargement de page perd
   tout l'historique.
3. Un indexer (Envio, Goldsky, thirdweb Insight…) — hors budget temps pour un blitz.

### 9.2 Validation différée des transactions

`eth_sendRawTransaction` peut **ne pas rejeter immédiatement** une transaction avec
un nonce gap ou un solde insuffisant. Le serveur RPC est conçu pour l'exécution
asynchrone et n'a pas nécessairement l'état le plus récent au moment de la
soumission. Ces transactions sont acceptées car elles peuvent devenir valides.

⚠️ **« Acceptée par le RPC » ≠ « sera incluse » ≠ « a réussi ».** Trois étapes
distinctes à tracer séparément dans l'UI :

| Étape | Signal | À afficher |
| --- | --- | --- |
| Soumise | `eth_sendRawTransaction` renvoie un hash | En attente |
| Incluse et exécutée | `eth_getTransactionReceipt` renvoie un receipt | Résultat (succès ou échec) |
| Finalisée | Le bloc du receipt est ≤ au bloc `finalized` | Confirmé |

Il existe `eth_sendRawTransactionSync` (avec timeout en millisecondes) qui renvoie
directement le receipt — chemin plus court que la boucle de polling manuelle,
utile ici. À noter : depuis la v0.14.5, cette méthode s'appuie sur les execution
events, donc **un nœud sans execution events activés rejette l'appel**. Sur un RPC
public, vérifier qu'elle répond avant d'en dépendre.

### 9.3 Pas de transactions pending interrogeables

`eth_getTransactionByHash` ne renvoie **que** les transactions déjà incluses dans un
bloc. Une transaction encore dans le mempool renvoie `null`. Ne pas construire de
logique d'UI sur « je retrouve ma transaction en pending ».

### 9.4 `debug_trace*` : paramètre d'options obligatoire

⚠️ Contrairement aux autres clients EVM où le paramètre est optionnel, Monad
renvoie `-32602 Invalid params` si l'objet d'options est omis. Toujours le passer,
même vide :

```json
{"method":"debug_traceCall","params":[{"to":"0x..."},"latest",{}]}
```

Le tracer par défaut avec `{}` est **`callTracer`**, pas les struct logs. Monad ne
supporte pas les struct logs au niveau opcode. Tracers disponibles : `callTracer`
et `prestateTracer`.

### 9.5 Souscriptions WebSocket

Types supportés : `newHeads`, `logs`, plus **deux extensions Monad** :
`monadNewHeads` et `monadLogs`.

Les variantes Monad ajoutent deux champs absents des versions standard :
- **`blockId`** — identifiant unique de *cette proposition* de bloc (distinct du
  numéro de bloc, puisque plusieurs propositions peuvent exister pour une même
  hauteur) ;
- **`commitState`** — l'état courant : `Proposed`, `Voted`, `Finalized`, `Verified`.

Un même bloc produit donc **plusieurs notifications** au fur et à mesure de sa
progression. Un bloc peut sauter `Voted` et passer directement de `Proposed` à
`Finalized` si le consensus est en avance sur l'exécution. Quand un bloc échoue à
être finalisé, il est abandonné **implicitement** — la finalisation d'un autre bloc
à la même hauteur le supplante, **sans événement d'abandon explicite**. Il faut donc
gérer ce cas côté client en comparant les `blockId` à une hauteur donnée.

⚠️ `syncing` et `newPendingTransactions` **ne sont pas supportés**.

💡 `monadLogs` est exactement l'outil pour afficher la progression
`Proposed → Voted → Finalized` d'une partie en direct (§3.2). C'est spécifique à
Monad, visuellement parlant, et ça ne coûte qu'une souscription.

### 9.6 Pools d'exécution `eth_call`

Les appels sont routés vers deux pools selon le gas limit demandé :

| Pool | Gas limit | Concurrence |
| --- | --- | --- |
| Low-gas | ≤ 8 100 000 | élevée (défaut 1 000 requêtes simultanées) |
| High-gas | > 8 100 000 | limitée (défaut 20) |

Sans gas limit spécifié, la requête tente d'abord le pool low-gas et bascule
automatiquement en high-gas si elle manque de gas. **Rester sous 8,1M de gas sur
les `eth_call` de lecture** pour bénéficier de la concurrence élevée — ce qui est
largement le cas pour lire un leaderboard.

### 9.7 Codes d'erreur

| Code | Catégorie | Cas fréquents |
| --- | --- | --- |
| `-32601` | Requête | méthode inconnue ou non supportée, JSON malformé |
| `-32602` | Paramètres | plage `eth_getLogs` trop large, options de trace omises |
| `-32603` | Exécution | erreur interne, transaction revert, RLP invalide |

⚠️ Depuis la v0.15.2, **le revert d'`eth_call` est remonté avec le code `3`**, plus
`-32603`. Du code qui filtre sur `-32603` pour détecter un revert ne fonctionnera pas.

### 9.8 État historique — limitation structurelle

⚠️ Les full nodes Monad ne donnent **pas** accès à un état historique arbitraire.
Chaque nœud conserve autant de tries d'état par bloc qu'il peut : pour un SSD de
2 To, cela correspond à **~40 000 blocs**, soit environ **3h20 à 300 ms par bloc**.

`eth_call` avec un numéro de bloc ancien échoue au-delà de cette fenêtre. Les
données *transactionnelles* (blocs, transactions, receipts, events, traces) restent
intégralement disponibles ; c'est l'*état* qui ne l'est pas.

Sur mainnet, un service RPC dédié existe pour l'état historique :
`https://rpc-mainnet.monadinfra.com`. Sur testnet, `testnet-rpc.monad.xyz`
(QuickNode) et `rpc-testnet.monadinfra.com` annoncent le support archive.

**Recommandation générale de la doc** : loguer via des events tout état qui devra
être relu plus tard, ou calculer hors-chaîne via un indexer. Pour BlitzBet, cela
confirme le choix de garder le leaderboard dans le state du contrat.

---

## 10. Contrats canoniques déployés sur le testnet (chain 10143)

Utiles si le périmètre s'étend. Vérifiés dans la doc au 19 septembre 2026.

| Contrat | Adresse |
| --- | --- |
| Wrapped MON (WMON) | `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541` |
| USDC (testnet, faucet Circle) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` |
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` |
| Foundry Deterministic Deployer | `0x4e59b44847b379578588920ca78fbf26c0b4956c` |
| SafeSingletonFactory | `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` |
| Safe v1.4.1 | `0x41675C099F32341bf84BFc5382aF534df5C7461a` |
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| EntryPoint v0.8 | `0x4337084d9e255fF0702461CF8895cE9E3b5Ff108` |
| ERC-6551 Registry | `0x000000006551c19487814612e58FE06813775758` |
| Pyth Entropy (VRF) | `0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320` |
| Pyth Price Feeds | `0x2880aB155794e7179c9eE2e38200202908C17B43` |
| Uniswap v4 PoolManager | `0x451D64ab3b650040d2aE1886602b97ed6eDc643d` |

Le dépôt `monad-crypto/protocols` référence les adresses de l'écosystème,
`monad-crypto/token-list` la liste des tokens.

USDC de testnet disponible via le faucet Circle (`faucet.circle.com`, sélectionner
Monad Testnet, limite d'une requête par paire stablecoin/testnet toutes les 2 heures).

---

## 11. Versions de protocole et changements récents

La révision protocole courante est **MONAD_TEN**, qui active **MIP-8** (stockage
par pages, §7.1). Timestamps d'activation du hard fork : testnet `1786545000`,
mainnet `1788359400` (2 septembre 2026, 14h30 UTC).

⚠️ **Incohérence observée dans la documentation elle-même** : la page
« Network Information » affichait encore `v0.15.2 / MONAD_NINE` au moment de
l'exploration, tandis que `/ai/current-facts` indiquait `v0.16.1 / v0.16.2 /
MONAD_TEN` et `/networks.json` donnait `0.16.2` (mainnet) et `0.16.3` (testnet).
**`https://docs.monad.xyz/networks.json` est la source désignée comme faisant foi.**

Autre incohérence : le changelog mentionne un gas limit de bloc à 200M hérité de
MONAD_FOUR, alors que la valeur courante partout ailleurs est 150M.

Historique des révisions, utile pour interpréter un vieux tutoriel :

| Révision | Contenu |
| --- | --- |
| MONAD_TEN | MIP-8 — stockage encodé par pages |
| MONAD_NINE | MIP-3 (mémoire linéaire), MIP-4 (précompile reserve balance), MIP-5 (fork Osaka, opcode CLZ) |
| MONAD_EIGHT | reserve balance sur le code hash final, pagination staking 100 → 50 |
| MONAD_SEVEN | tarification des opcodes |
| MONAD_FOUR | staking, reserve balance, EIP-7702, base fee dynamique, gas limit 30M/tx, contrats 128 Ko |
| MONAD_THREE | MonadBFT, bloc 500 ms → 400 ms |
| MONAD_ONE | bloc 1 s → 500 ms |

Le temps de bloc est passé à **300 ms** avec MIP-12 (v0.15.0), qui a aussi réduit la
récompense de bloc de 25 à 18 MON.

---

## 12. Synthèse des implications pour BlitzBet

Récapitulatif opérationnel des points ci-dessus, classés par criticité.

### 12.1 Critique — à traiter avant tout code de jeu

1. **Gestion locale des nonces** (§4.4). Architecture wallet unique + Aviator
   multi-joueurs simultanés ⇒ collisions de nonces garanties sans compteur local
   sérialisé. **C'est le risque n°1.**
2. **Leaderboard dans le state du contrat**, pas reconstruit depuis les logs (§9.1).
   La limite de 100 blocs représente 30 secondes d'historique.
3. **Solde du wallet largement au-dessus de 10 MON** (§4.2), viser 50 MON.
   En dessous, des transactions peuvent être exclues silencieusement en rafale.
4. **Gas limits fixés en dur** par fonction de jeu (§6.1). Monad facture le limit.

### 12.2 Important — impacte la qualité de la démo

5. **Aviator indexé sur `block.number`, pas `block.timestamp`** (§5.1).
   Le timestamp a une granularité d'une seconde et stagne sur 3-4 blocs.
6. **Lire le receipt, pas seulement le hash** (§9.2). Inclusion ≠ succès.
7. **Garde `tx.origin`** sur les fonctions de jeu (§5.2), une ligne.
8. **Fenêtre `blockhash` de 256 blocs = 76 s** (§5.1). Tout règlement différé doit
   tenir dans cette fenêtre, sinon `blockhash()` renvoie zéro.
9. **Vérifier les contrats** sur MonadVision et/ou Monadscan (§8.5). Deux minutes,
   et c'est l'argument de crédibilité central pour un projet de jeu.

### 12.3 Optimisations si le temps le permet

10. **Commit-reveal sur la Roulette** (§5.3) — l'animation masque entièrement le
    délai de 600 ms, coût UX nul, gain d'argumentaire important.
11. **Affichage `Proposed → Voted → Finalized`** via `monadLogs` (§9.5). Très
    visuel, strictement spécifique à Monad.
12. **Structs compacts sur pages contiguës** pour le state des rounds (§7.1).
13. **`Promise.all` sur les envois de transactions** plutôt qu'une boucle
    séquentielle (§8.4).

### 12.4 À mentionner dans le README et tenir prêt pour le Q&A

- Limites de la randomness du MVP et chemin de production (Pyth Entropy, §5.4/5.6).
- Le compromis `tx.origin` et ce qu'il casse (smart accounts).
- Précompile P256 comme réponse à l'onboarding sans wallet (§7.3).
- Étiqueter visiblement tout jeu non jouable de bout en bout comme prototype — le
  règlement exige que le projet soit « deployed and operational ».

---

## 13. Ressources de référence

| Ressource | URL |
| --- | --- |
| Index machine de toute la doc | `https://docs.monad.xyz/llms.txt` |
| Faits réseau courants (source de vérité) | `https://docs.monad.xyz/ai/current-facts` |
| Versions courantes en JSON | `https://docs.monad.xyz/networks.json` |
| Index doc développeur | `https://docs.monad.xyz/ai/developers` |
| Index doc JSON-RPC | `https://docs.monad.xyz/ai/rpc` |
| Index doc architecture | `https://docs.monad.xyz/ai/architecture` |
| Client consensus (Rust, GPL-3.0) | `https://github.com/category-labs/monad-bft` |
| Client exécution (C++, GPL-3.0) | `https://github.com/category-labs/monad` |
| MIPs (propositions d'amélioration) | `https://mips.monad.xyz` |
| Adresses écosystème | `https://github.com/monad-crypto/protocols` |
| Discord développeurs | `https://discord.gg/monaddev` |

**Astuce de navigation** : toute page de `docs.monad.xyz` est disponible en markdown
brut en ajoutant `.md` à son URL. Pratique pour alimenter un contexte LLM sans
scraping HTML.

---

*Document rédigé le 19 septembre 2026 à partir de l'exploration intégrale de
docs.monad.xyz. Les valeurs chiffrées reflètent l'état de la documentation à cette
date ; se référer à `networks.json` pour les versions courantes.*
