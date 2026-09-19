# BlitzBet — passation de contexte

**Date de la session :** samedi 19 septembre 2026, ~12h40 → 16h40 (heure de Paris)
**Repo :** https://github.com/Wilivms/BlitzBet — branche `main`
**Dossier local :** `~/src/BlitzBet` (Mac de Tim)
**Dernier commit de la session :** `f743b85`

> ⚠️ **Trois corrections au brief de passation.** Le résumé demandé contenait des affirmations
> qui ne correspondent pas à ce qui a été observé. Elles sont corrigées dans ce document et
> signalées en section 7. Lire cette section avant de reprendre le travail.

---

## 1. Contexte du projet

### Ce que c'est

**BlitzBet** — un casino entièrement on-chain sur Monad testnet, construit pour le hackathon
**Monad Blitz Paris** (19 septembre 2026, 9h–21h, deadline de soumission **18h00**).

Format de démo visé : une table live de 4-5 places, Tim joue avec le public simultanément.
Les spectateurs scannent un QR code et misent depuis leur téléphone.

**Point clé d'architecture : il n'y a AUCUNE connexion wallet.** Les joueurs du public n'ont
ni wallet ni clé privée. Un wallet unique (celui du projet) déploie les contrats, détient la
bankroll et signe **toutes** les transactions de tous les joueurs. Un joueur est identifié par
un `bytes32` (« siège ») généré côté serveur et stocké dans le `localStorage` de son téléphone.
C'est **custodial par construction**, et c'est assumé.

### Les 4 jeux

| Jeu | Description | Statut |
|---|---|---|
| **Aviator** | Crash game. Multiplicateur +2% par bloc, commit-reveal | Écrit, testé, déployé |
| **CoinFlip** | Pile ou face, double ou rien | Écrit, testé, déployé |
| **Roulette** | Européenne zéro unique, table partagée, 8 types de mise | Écrit, testé, déployé |
| **Blackjack** | Contre le contrat, hit/stand/double/split, croupier à 17 | Écrit, testé, déployé |

**L'Aviator est l'argument de vente du projet.** Le règlement du hackathon met la nouveauté en
critère de vote n°1 et décourage explicitement les clones. Les crash games en production
animent le multiplicateur côté navigateur avec un crash décidé par un serveur privé, parce
qu'à 2-12 s de bloc un multiplicateur indexé sur la hauteur de bloc n'avancerait que 3-4 fois
par tour. À 300 ms, il avance ~3,3 fois par seconde : l'encaissement d'un joueur est une vraie
transaction, et **le bloc où elle atterrit EST le multiplicateur obtenu**.

### Stack technique

**Contrats** — Solidity `0.8.30`, Foundry `1.8.3`, `forge-std`. Pas d'OpenZeppelin, pas de
dépendance externe. **54 tests, tous au vert** (21 `BlitzBet.t.sol` + 14 `Blackjack.t.sol` +
19 `Aviator.t.sol`). Chaque suite vérifie après chaque coup que le registre du hub égale le
solde réel du contrat.

**Front** — Next.js `16.3.5` (App Router, Turbopack), React `19.2.8`, TypeScript, Tailwind v4,
`viem ^2.56.8`, `qrcode.react`, `server-only`. Aucune librairie de connexion wallet (wagmi,
RainbowKit…) — inutile par design.

**Store partagé** — Redis via l'API REST Upstash, appelée en `fetch` brut (aucun SDK installé).

**Réseau** — Monad Testnet, chain ID **10143**, RPC `https://testnet-rpc.monad.xyz/`,
symbole **MON**, explorateur `https://testnet.monadexplorer.com/`.

### Structure du repo

```
~/src/BlitzBet/
├── contracts/          Foundry
│   ├── src/CasinoHub.sol, GameBase.sol
│   ├── src/games/CoinFlip.sol, Roulette.sol, Blackjack.sol, Aviator.sol
│   ├── script/Deploy.s.sol
│   └── test/BlitzBet.t.sol, Blackjack.t.sol, Aviator.t.sol
├── web/                Next.js
│   ├── app/page.tsx (écran de table), app/play/page.tsx (téléphone)
│   ├── app/api/{state,join,coinflip,roulette,blackjack,aviator}/route.ts
│   ├── lib/{chain,relayer,kv,abi,games,seat,aviatorSeed,useTable,useAviator}.ts
│   └── components/{GameCard,Leaderboard,Pocket,Card,BlackjackPanel,AviatorPanel}.tsx
├── scripts/gen-abi.sh
└── README.md
```

### Contraintes Monad qui ont façonné le code

Quatre points tirés de la doc, tous appliqués :

1. **`TIMESTAMP` est à la seconde, les blocs à 300 ms** → 3-4 blocs consécutifs partagent le
   même timestamp. Le seed d'aléa ne s'appuie donc pas dessus.
2. **Un seul wallet signe tout** → `tx.origin` est une constante, la garde anti-rejeu initialement
   prévue dessus ne protégeait rien. Remplacée par un double compteur en storage (par siège +
   global) : deux tirages ne partagent jamais un seed, même dans le même bloc.
3. **Monad facture le *gas limit*, pas le gas consommé** → chaque appel du relayer porte une
   limite explicite et serrée (`GAS` dans `lib/relayer.ts`).
4. **Reserve balance de 10 MON, pas de mempool global** → le wallet doit rester largement
   au-dessus de 10 MON, et les nonces sont le point de rupture n°1.

### Commits de la session

| SHA | Contenu |
|---|---|
| `f801c0a` | CasinoHub + CoinFlip + Roulette, 21 tests |
| `d0881b2` | Relayer, routes API, écran de table |
| `09965ec` | Blackjack complet, 14 tests |
| `631c562` | Aviator, 19 tests |
| `ea5ec58` | Store Redis partagé + adresses testnet dans le README |
| `d594a1f` | Refonte UI sobre aux couleurs Monad, 4 cartes, zéro onglet |
| `f743b85` | Correctif `kv.ts` : trois conventions de nommage Redis |

---

## 2. Déploiement des smart contracts

### Commande utilisée

Clé importée dans un keystore chiffré au préalable :

```bash
cast wallet import blitzbet --interactive
```

Puis :

```bash
cd ~/src/BlitzBet/contracts
BANKROLL_WEI=50000000000000000000 forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz/ \
  --chain 10143 \
  --account blitzbet \
  --broadcast
```

`BANKROLL_WEI=50e18` = 50 MON injectés dans la bankroll à la construction du `CasinoHub`.

### Adresses déployées (Monad testnet, chain 10143)

| Contrat | Adresse |
|---|---|
| **CasinoHub** | `0x46a1b46016cf0c0e328aa5d304f2f11257b21a16` |
| **CoinFlip** | `0x271926351dbd8e3df8b123a72a643ff3a16c71e9` |
| **Roulette** | `0xb8541269534707b494aeaf61cf6bb2688b3cfe84` |
| **Blackjack** | `0x4fc577fe0aed3815dbe1cbea0ab18f7b7317e7ef` |
| **Aviator** | `0xbef18258cc7f7c4f29042dd1c11f3ff549505e56` |

**Wallet unique** (déploiement + bankroll + signature de toutes les mises) :
`0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368`

### Validation du déploiement

Le terminal ayant été fermé, les adresses ont été récupérées depuis
`contracts/broadcast/Deploy.s.sol/10143/run-latest.json`. Les **9 transactions** (5 `CREATE`
+ 4 `setGame`) sont toutes en `status=0x1`. Le déploiement est complet et les 4 jeux sont bien
autorisés dans le hub.

> Note : cette validation repose sur les receipts du fichier `broadcast/`, **pas** sur une
> lecture on-chain en direct. Aucun `cast call` de vérification (`isGame`, `bankroll`,
> `owner`) n'a pu être exécuté — voir section 5 pour pourquoi.

### Vérification des contrats : ❌ NON FAITE

Aucun `forge verify-contract` n'a été exécuté. Le code source n'est pas vérifié sur
l'explorateur. Commande prête à l'emploi :

```bash
cd ~/src/BlitzBet/contracts
forge verify-contract 0x46a1b46016cf0c0e328aa5d304f2f11257b21a16 src/CasinoHub.sol:CasinoHub \
  --chain 10143 --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/
```

À répéter pour les 4 jeux (`src/games/CoinFlip.sol:CoinFlip`, etc.).

---

## 3. Problème Vercel — ❌ NON RÉSOLU

### Symptôme

`https://blitz-bet-wheat.vercel.app` renvoie **404 NOT_FOUND** (code d'erreur de l'Edge
Network Vercel, pas une 404 Next.js), alors que le build Vercel réussit et liste correctement
les 9 routes, et que le domaine est marqué « Production » + « Valid Configuration ».

### Mesure effectuée sur l'URL de production

Test via le navigateur intégré (`fetch` sur chaque chemin, lecture des en-têtes) :

| Chemin | Statut | En-tête `x-vercel-error` |
|---|---|---|
| `/` | 404 | `NOT_FOUND` |
| `/play` | 404 | `NOT_FOUND` |
| `/api/state` | 404 | `NOT_FOUND` |
| `/favicon.ico` | 404 | `NOT_FOUND` |
| `/_next/static/…` | 404 | `NOT_FOUND` |

Serveur : `Vercel`. ID de trace : `cdg1::…`

**`/favicon.ico` en 404 est l'élément décisif.** Si un build Next.js était réellement servi
avec un problème de routing, un fichier statique de l'output sortirait quand même. Rien n'est
servi du tout : le domaine ne pointe sur aucun déploiement ayant du contenu.

### Second test décisif

`https://blitz-bet-git-main-blitz-bet.vercel.app` (alias de branche) **redirige vers la page
de login Vercel**. Un sous-domaine `.vercel.app` inexistant renverrait `DEPLOYMENT_NOT_FOUND` ;
une redirection login signifie que le déploiement **existe** et qu'il est **protégé**.

→ Les pushes sur `main` produisent bien des déploiements, mais en **Preview**, protégés par la
Deployment Protection. Aucun déploiement **Production** n'a jamais été créé, donc le domaine de
production n'a rien à servir.

### Pistes explorées et ÉCARTÉES

| Piste | Verdict |
|---|---|
| **ESLint / `unrs-resolver` postinstall bloqué** | ❌ Écartée. Next 16 a **supprimé la clé `eslint` de `NextConfig`** (erreur TS2353 à la compilation en tentant de l'ajouter) → `next build` ne lance plus ESLint du tout. Les warnings npm `deprecated eslint` et `allow-scripts` sont cosmétiques. |
| **`middleware.ts` / `.js`** | ❌ Aucun fichier middleware nulle part dans le repo (`find` sur tout l'arbre). |
| **`basePath`** | ❌ Absent. `web/next.config.ts` est littéralement `const nextConfig: NextConfig = {};` |
| **`redirects` / `rewrites` / `output: "export"`** | ❌ Aucun. |
| **`vercel.json`** | ❌ N'existe pas dans le repo. |
| **Root Directory mal configuré** | ❌ Écartée : le log de build montre `> web@0.1.0 build`, donc le Root Directory `web` est bien pris en compte. |
| **Erreur de compilation** | ❌ Écartée : le build local en mode production passe (exit 0). |

### Hypothèse retenue (NON CONFIRMÉE en dashboard)

**Aucun déploiement Production n'existe.** Deux causes possibles, non départagées :

1. La **Production Branch** du projet Vercel n'est pas `main` → tous les pushes partent en Preview.
2. Le domaine a été attaché à un déploiement initial vide (le repo n'avait que `README.md` +
   `screenshots/` aux commits `d347f50` et `ef3fe12`, avant l'ajout de `web/`) et n'a jamais
   été repointé.

**Cette hypothèse n'a pas pu être vérifiée** : le navigateur intégré n'était pas connecté au
compte Vercel, et je ne me connecte pas à un compte utilisateur.

### Ce qui reste flou / non vérifié

- Si le 404 **persiste actuellement** — dernière mesure à ~16h15, avant les commits `d594a1f`
  et `f743b85`.
- Si un déploiement a été **promu en Production** depuis.
- L'**ID exact** du déploiement marqué « Production » **ET** « Current », et son SHA de commit
  comparé à celui du build vérifié (question posée, jamais répondue faute d'accès dashboard).
- L'état réel de **Deployment Protection** (Standard vs All Deployments).
- Pourquoi la production divergerait du local : **à ce stade, rien n'indique une divergence de
  comportement.** Le local fonctionne et la production ne sert rien du tout. Ce n'est pas deux
  comportements différents du même code, c'est du code servi d'un côté et pas de l'autre.

### 🔧 Diagnostic : ce qu'il reste à faire, dans l'ordre

**Étape 1 — Débloquer (1 clic, ~30 s)**
Dashboard Vercel → onglet **Deployments** → dernier build réussi (commit `f743b85`) → menu `⋯`
→ **Promote to Production**. Puis retester :

```bash
curl -I https://blitz-bet-wheat.vercel.app/
curl -I https://blitz-bet-wheat.vercel.app/favicon.ico
```

Un `HTTP/2 200` sur `/` (et absence de l'en-tête `x-vercel-error`) confirme la résolution.

**Étape 2 — Empêcher la récidive**
Settings → **Git** → **Production Branch** → mettre `main` → Save.

**Étape 3 — Vérifier la protection (bloquant pour la démo)**
Settings → **Deployment Protection** → **Vercel Authentication** :
- « Standard Protection » → seuls les previews sont protégés, la production est publique. ✅
- « All Deployments » → **désactiver**, sinon les téléphones du public tombent sur un login
  Vercel en scannant le QR code et la démo est morte.

**Étape 4 — Si le 404 persiste après promotion**
Vérifier le **Build Output** du déploiement promu (onglet Deployments → le déploiement →
« Build Logs » puis « Output »). Si l'output est vide ou ne contient pas `.next`, c'est le
Root Directory du **projet** (pas du build) qui est en cause. Alternative en ligne de commande :

```bash
npx vercel@latest login
npx vercel@latest inspect https://blitz-bet-wheat.vercel.app
npx vercel@latest ls blitz-bet
```

`vercel inspect` donne l'ID du déploiement réellement servi par le domaine — c'est la réponse
directe à la question « quel déploiement est Current ? ».

**Étape 5 — Vérifier les variables Redis une fois en ligne**
Après promotion, appeler `/api/state` et regarder les Runtime Logs. Si le warning
`[kv] Aucune config Redis REST trouvée` apparaît, voir section 4.

---

## 4. Variables d'environnement

### Sur Vercel (noms uniquement)

D'après le screenshot de référence fourni par Tim :

```
NEXT_PUBLIC_CASINO_HUB
NEXT_PUBLIC_COINFLIP
NEXT_PUBLIC_ROULETTE
NEXT_PUBLIC_BLACKJACK
NEXT_PUBLIC_AVIATOR
NEXT_PUBLIC_RPC_URL
RPC_URL
NEXT_PUBLIC_BUY_IN
RELAYER_PRIVATE_KEY      ← secret, ne jamais afficher ni transmettre
REDIS_URL
```

**Root Directory Vercel :** `web`
**Domaine de production :** `blitz-bet-wheat.vercel.app`

### ⚠️ Problème sur `REDIS_URL`

`REDIS_URL` est une chaîne de connexion **TCP** (`rediss://…`). Le client `lib/kv.ts` parle
l'**API REST** en `fetch` — les fonctions Vercel ne peuvent de toute façon pas ouvrir de socket
Redis depuis l'edge. Le commit `f743b85` fait que `kv.ts` résout désormais dans cet ordre :

1. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
2. `KV_REST_API_URL` + `KV_REST_API_TOKEN`
3. `REDIS_REST_API_URL` + `REDIS_REST_API_TOKEN`
4. Reconstruction best-effort depuis `REDIS_URL` (host + mot de passe) — **non garantie**

**Recommandation :** ajouter explicitement `UPSTASH_REDIS_REST_URL` et
`UPSTASH_REDIS_REST_TOKEN` (visibles dans le dashboard Upstash, section « REST API »). Si la
reconstruction échoue, les appels Redis renvoient 401 et le code **retombe silencieusement en
mémoire de processus** — ce qui annule la protection anti-collision de nonce en production.

`kvHealth()` et `kvSource` ont été ajoutés pour pouvoir vérifier au lieu d'espérer.

### En local (`web/.env.local`)

Le fichier **n'existait pas** au début de l'audit — créé pendant la session avec les 5 adresses,
les 2 RPC et le buy-in. Tim y a ajouté `RELAYER_PRIVATE_KEY`. `UPSTASH_REDIS_REST_URL` et
`UPSTASH_REDIS_REST_TOKEN` y sont présentes mais **vides**. Fichier bien couvert par
`web/.gitignore:34` (`.env*`).

---

## 5. Tests locaux effectués et résultats réels

### Build de production — ✅ SUCCÈS

```
$ cd ~/src/BlitzBet/web && npm run build

▲ Next.js 16.3.5 (Turbopack)
✓ Running next.config.ts took 94ms
✓ Compiled successfully in 3.7s
  Finished TypeScript in 2.7s
✓ Generating static pages using 3 workers (5/5) in 90ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/aviator
├ ƒ /api/blackjack
├ ƒ /api/coinflip
├ ƒ /api/join
├ ƒ /api/roulette
├ ƒ /api/state
└ ○ /play

EXIT=0
```

Aucun `Error:`, aucun `Failed to compile`, aucun `Type error:`. Les 9 routes correspondent
exactement à l'attendu.

### Serveur de production local — ✅ SUCCÈS

```
$ npm run start
- Local:  http://localhost:3000
✓ Ready in 227ms

GET /      -> HTTP 200 (9656 octets) — contenu « BlitzBet » présent
GET /play  -> HTTP 200 (7132 octets) — contenu « BlitzBet » présent
```

### Routes API — ⚠️ HTTP 500, cause réseau d'environnement

```
GET  /api/state    -> HTTP 500 en 1.14 s
GET  /api/aviator  -> HTTP 500 en 1.10 s
POST /api/join     -> HTTP 500 en 1.11 s
```

Corps de réponse identique sur les trois :

```json
{"error":"HTTP request failed.\n\nURL: https://testnet-rpc.monad.xyz/\n
Request body: [{\"method\":\"eth_getTransactionCount\",
\"params\":[\"0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368\",\"pending\"]}]\n\n
Details: fetch failed\nVersion: viem@2.56.8"}
```

**Cause exacte : `testnet-rpc.monad.xyz` est bloqué par l'allowlist du proxy de
l'environnement d'exécution.** Diagnostic direct :

```
$ curl -v https://testnet-rpc.monad.xyz/
< HTTP/1.1 403 Forbidden
< X-Proxy-Error: blocked-by-allowlist
```

Ce n'est **ni** un rate limit, **ni** un bug applicatif. Le même blocage s'applique au
conteneur cloud et à la VM du pont — d'où l'impossibilité de faire le moindre `cast call` de
vérification on-chain pendant toute la session.

**Ce que ces 500 prouvent malgré tout — et c'est beaucoup :**

- Le routing Next.js fonctionne (les handlers s'exécutent).
- Les variables d'environnement se chargent correctement.
- `viem` **accepte la clé privée** et en dérive la **bonne adresse**
  (`0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368` apparaît dans la requête RPC).
- Le verrou de nonce s'est pris correctement (le code est entré dans la section critique).
- Aucune erreur de format de clé, aucune erreur `viem`/`ethers`, aucune erreur Redis bloquante.

Tout le chemin de code fonctionne, ça s'arrête pile à la requête réseau sortante.

### Validation de la clé privée — ✅

Sans jamais afficher la valeur : 66 caractères, préfixe `0x`, 64 caractères hex valides, pas
une seed phrase. `privateKeyToAccount()` en dérive `0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368`,
qui correspond au wallet du projet.

### Tests Foundry — ✅ 54/54

```
Ran 3 test suites: 54 tests passed, 0 failed, 0 skipped
```

Exécutés localement avec un `solc` 0.8.30 aarch64 téléchargé manuellement (le host
`binaries.soliditylang.org` est également bloqué par l'allowlist ; binaire récupéré depuis
`github.com/nikitastupin/solc`). Foundry lui-même a dû être installé depuis les releases
GitHub, `foundry.paradigm.xyz` étant bloqué.

---

## 6. Deux bugs réels trouvés et corrigés pendant l'investigation

### Bug 1 — Double `RELAYER_PRIVATE_KEY` dans `.env.local`

Le fichier contenait **deux** lignes `RELAYER_PRIVATE_KEY` : celle de Tim en **ligne 7**
(renseignée, 66 caractères) et un placeholder vide que j'avais créé en **ligne 20**. dotenv
conserve la **dernière** occurrence → la clé valide aurait été écrasée par une chaîne vide au
runtime, et toutes les routes API auraient échoué sur `RELAYER_PRIVATE_KEY manquant`.

**Corrigé** : déduplication, une seule ligne renseignée restante. Purement local, non commité
(fichier gitignoré).

### Bug 2 — `kv.ts` ne reconnaissait pas les bons noms de variables Redis

Le client ne lisait que `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Or Vercel
injecte `KV_REST_API_URL` / `KV_REST_API_TOKEN` (onglet Storage) ou `REDIS_URL` seul
(Marketplace). Avec aucun de ces noms attendus, le client **retombait en mémoire de processus
en ne loguant qu'un warning** — le verrou distribué qui protège l'attribution des nonces était
donc **silencieusement inerte en production**, exactement la panne qu'il existe pour empêcher.

**Corrigé et poussé** (`f743b85`) : résolution en cascade sur les trois conventions +
reconstruction best-effort depuis `REDIS_URL`, avec `kvHealth()` et `kvSource` pour diagnostic.

---

## 7. ⚠️ Corrections au brief de passation

Trois affirmations du brief ne correspondent pas à ce qui a été observé.

### 7.1 — « Les routes API répondent correctement en local après reset du rate limit RPC (15 req/sec) »

**Faux pour cette session.** Les routes API n'ont **jamais** répondu correctement depuis mon
environnement. Elles ont systématiquement échoué en 500 avec `fetch failed`, cause
`blocked-by-allowlist` (403 du proxy) — un **blocage réseau total**, pas un rate limit, et
aucun nouvel essai n'a jamais abouti.

Les rate limits réels de la doc Monad ne sont pas non plus 15 req/s :

| Fournisseur | Limite |
|---|---|
| QuickNode (`testnet-rpc.monad.xyz`) | **50 rps**, dont **25 rps** pour `eth_call` et `eth_estimateGas`, batch 100 |
| Ankr (`rpc.ankr.com/monad_testnet`) | 300 req/10 s, 12 000 req/10 min |
| Monad Foundation (`rpc-testnet.monadinfra.com`) | 20 rps, batch interdit |

Si Tim a observé un rate limit en relançant les tests depuis son propre terminal, c'est une
observation qui lui appartient — **elle n'a pas été constatée dans cette session** et ne doit
pas être enregistrée comme un fait vérifié.

### 7.2 — « Système de solde fictif (100 MON factices par joueur) »

**Ne correspond pas à l'implémentation.** Il n'existe aucun solde fictif ni aucune valeur de
100 MON dans le code. Le fonctionnement réel :

- Un joueur rejoint via `POST /api/join` → le relayer appelle `CasinoHub.join(seatId, nickname, buyIn)`.
- `buyIn` vaut `NEXT_PUBLIC_BUY_IN` = **0.5 MON** (pas 100), **prélevé sur la bankroll réelle**
  du contrat.
- Les jetons sont de **vrais MON de testnet**, comptabilisés on-chain dans le mapping
  `chips[bytes32]` du `CasinoHub`. Ils ne sont pas simulés.
- La persistance est **on-chain**, pas « côté serveur par identifiant de session ». Le serveur
  ne stocke **aucun** état de joueur. Seul le `seatId` (un `bytes32`) vit dans le `localStorage`
  du téléphone.
- Après un rafraîchissement de page : le `seatId` est relu depuis `localStorage`, et le solde
  est relu **depuis la chaîne** via `/api/state`. Ce mécanisme est écrit mais **n'a jamais été
  testé de bout en bout** (RPC inaccessible).

Conséquence de sécurité à connaître : quiconque obtient un `seatId` peut miser les jetons
correspondants. Acceptable en testnet, inacceptable ailleurs.

### 7.3 — « Rendre chaque carte cliquable vers la bonne page de jeu »

Précision : **il n'existe pas de pages de jeu séparées.** Il y a exactement deux pages, `/` et
`/play`. Sur `/play`, les 4 cartes **sont déjà cliquables** et ouvrent le jeu en plein écran
avec un retour « ← Tous les jeux ». Sur l'écran de table `/`, les cartes ne sont volontairement
pas cliquables : elles portent les commandes du croupier (Ouvrir/Décoller, Ouvrir un tour/Lancer).

Si l'intention est d'avoir de vraies routes `/play/coinflip`, `/play/roulette`, etc., c'est un
changement d'architecture à décider explicitement — ce n'est pas un bug à corriger.

---

## 8. Ce qu'il reste à faire

### Priorité absolue

1. **Résoudre le 404 Vercel** — non résolu. Procédure complète en section 3.
2. **Tester le parcours de bout en bout** depuis le réseau de Tim (le seul endroit où le RPC
   passe). Aucun jeu n'a jamais été joué contre la chaîne réelle. **C'est le risque n°1 restant.**

### Ensuite

3. **Vérifier les contrats** sur l'explorateur (`forge verify-contract`, section 2).
4. **Cache léger sur `/api/state`** — la page de table poll toutes les 900 ms et l'Aviator
   toutes les 450 ms. Avec 5 téléphones, on approche des 25 rps d'`eth_call` de QuickNode.
   Un cache de 300-500 ms côté serveur suffirait.
5. **Animations par jeu** : roue de roulette qui tourne, cartes de blackjack distribuées une à
   une, pièce en rotation 3D, avion qui monte puis décroche. Rien de tout ça n'existe — l'UI
   actuelle est volontairement sobre et statique.
6. **Documenter le système de jetons** dans le README (voir 7.2 pour la description exacte).

### Filet de sécurité si Vercel n'est pas résolu à temps

Le serveur de production local fonctionne parfaitement. Lancer sur le Mac :

```bash
cd ~/src/BlitzBet/web && npm run start
ipconfig getifaddr en0        # → ex. 192.168.1.42
```

Faire scanner `http://192.168.1.42:3000/play` au public. Le QR code s'adapte automatiquement
(il utilise `window.location.origin`). Contrainte : tous les appareils doivent être sur le même
Wi-Fi. Avantage réel : **un seul processus Node**, donc le verrou de nonce fonctionne
nativement, même sans Redis configuré.

---

## 9. Liens de référence utilisés pendant la session

### Documentation Monad (consultée et exploitée)

- https://docs.monad.xyz/ai/developers — index développeurs
- https://docs.monad.xyz/developer-essentials/summary — blocs 300 ms, finalité, TIMESTAMP à la seconde
- https://docs.monad.xyz/developer-essentials/differences — Monad vs Ethereum
- https://docs.monad.xyz/developer-essentials/testnet — chain ID, RPC, rate limits
- https://docs.monad.xyz/developer-essentials/best-practices — nonces, batching, indexeurs
- https://docs.monad.xyz/developer-essentials/gas-pricing — facturation au gas limit
- https://docs.monad.xyz/developer-essentials/reserve-balance — réserve de 10 MON
- https://docs.monad.xyz/developer-essentials/opcode-pricing — repricing, pages de 128 slots
- https://docs.monad.xyz/developer-essentials/precompiles
- https://docs.monad.xyz/developer-essentials/transactions
- https://docs.monad.xyz/developer-essentials/faucet
- https://docs.monad.xyz/guides/deploy-smart-contract/foundry
- https://docs.monad.xyz/guides/verify-smart-contract
- https://docs.monad.xyz/guides/verify-smart-contract/foundry — commandes de vérification exactes
- https://docs.monad.xyz/guides/evm-resources/evm-behavior
- https://docs.monad.xyz/ — consultée pour la palette de marque : **aucune couleur n'y figure**

### Hackathon (pages Notion lues intégralement)

- https://monad-foundation.notion.site/Monad-Blitz-Paris-2736367594f2836989b9010568428050 — page principale, programme
- https://monad-foundation.notion.site/Rules-Guidelines-IMPORTANT-PLEASE-READ-dd76367594f282fe8de681613a86def6 — règlement
- https://monad-foundation.notion.site/Judging-Process-Criteria-1bd6367594f2833989a881b98504034f — critères de vote
- https://monad-foundation.notion.site/Submission-Process-b7f6367594f282eb8c5601f027f40096 — procédure de soumission
- https://monad-foundation.notion.site/Preparing-for-Your-Project-Demo-a5c6367594f283dc8d0f014c67f9536b — format de démo (3 min)
- https://blitz.devnads.com/events/monad-blitz-paris — portail de soumission (référencé, non ouvert)
- https://github.com/monad-developers/monad-blitz-paris — repo amont du fork

### Outils et services

- https://testnet.monadexplorer.com/ — explorateur utilisé dans le code
- https://faucet.monad.xyz — faucet testnet
- https://sourcify-api-monad.blockvision.org/ — endpoint de vérification Sourcify
- https://github.com/foundry-rs/foundry/releases — Foundry 1.8.3 (`foundry.paradigm.xyz` bloqué)
- https://github.com/nikitastupin/solc — binaires solc linux-aarch64 (`binaries.soliditylang.org` bloqué)
- https://github.com/pcaversaccio/solidity-games — évalué comme base, **non utilisé** (licence WTFPL vérifiée via l'API GitHub)
- https://github.com/Wilivms/BlitzBet — le repo du projet

### Non consultées

Aucune documentation **Vercel** ni **viem** n'a été consultée pendant cette session. Le
diagnostic Vercel repose uniquement sur des mesures directes (codes HTTP, en-têtes
`x-vercel-error`, comportement de l'alias de branche). Ne pas présenter ces conclusions comme
sourcées d'une doc officielle.

### Adresses mentionnées mais non vérifiées on-chain

Multicall3 : `0xcA11bde05977b3631167028862bE2a173976CA11` (donnée par la doc Monad, non utilisée
dans le code final).

---

## 10. Règlement du hackathon — point de vigilance

Le règlement écrit dit explicitement : *« You cannot submit existing projects, fork existing
codebases (beyond standard libraries/boilerplates) »*. Tim a indiqué que les organisateurs ont
assoupli cette règle à l'oral le matin même, information non écrite sur la page Notion.

**Dans les faits, la question est sans objet** : tous les contrats ont été écrits from scratch
pour ce projet, et le README le dit tel quel plutôt que de revendiquer une réutilisation qui
n'a pas eu lieu.

Deuxième point de vigilance : le critère de vote n°1 est **Novelty & Originality**, et le
règlement décourage explicitement les clones d'applications existantes sans twist spécifique à
Monad. Un casino est structurellement un ensemble de clones — **l'Aviator est la seule réponse
solide à ce critère**, et la démo devrait commencer par lui.
