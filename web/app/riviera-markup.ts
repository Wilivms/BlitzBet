// Balisage de la scène Riviera. Le script public/riviera.js le pilote (three.js + routes /api).
export const RIVIERA_MARKUP = String.raw`
<div id="stage"></div>

<header class="top">
  <div class="brand">BlitzBet<small>Casino Riviera · on-chain sur Monad</small></div>
  <nav class="tabs" id="tabs" aria-label="Choisir la table">
    <span class="pill" id="pill"></span>
    <button id="tabBJ" aria-pressed="true">Blackjack</button>
    <button id="tabRL" aria-pressed="false">Roulette</button>
    <button id="tabCR" aria-pressed="false">L'Envol</button>
    <button id="tabCF" aria-pressed="false">Pile ou face</button>
  </nav>
  <div class="right">
    <button class="ghost" id="moreBtn" aria-expanded="false" aria-controls="more">Menu</button>
    <div class="more" id="more">
      <button class="ghost" id="qrBtn">Inviter · QR</button>
      <button class="ghost wallet" id="walletBtn"><i></i><span>Connecter un wallet</span></button>
      <button class="ghost" id="histBtn" aria-expanded="false">Classement</button>
      <button class="ghost" id="payBtn" aria-expanded="false">Règles</button>
      <a class="ghost" id="txLink" href="#" target="_blank" rel="noreferrer" hidden>Dernière transaction ↗</a>
      <button class="ghost net" id="netPill" data-st="wait"><i></i><span>Connexion…</span></button>
      <button class="ghost" id="recenter">Recentrer</button>
    </div>
    <div class="bank"><span>Crédits</span><span id="bank">—</span></div>
  </div>
</header>

<div id="banner" aria-live="polite"></div>
<div id="crashHud" hidden><div id="crashMult">1,00×</div><div id="crashSub"></div><div class="cbar"><i id="crashBar"></i></div><div id="crOthers"></div></div>

<aside id="hist" class="panel" hidden>
  <h3>Classement on-chain</h3>
  <p id="histNote"></p>
  <table id="histTable"></table>
  <h3>Rejoindre la table</h3>
  <p>Scannez pour jouer depuis votre téléphone. Aucun wallet requis : la maison signe chaque mise.</p>
  <button class="btn" id="qrOpen">Afficher le QR code</button>
  <h3>Wallets du casino</h3>
  <div class="wallets">
    <div><span>Maison</span><a id="wHouse" data-addr="{{HOUSE}}" target="_blank" rel="noreferrer"></a></div>
    <div><span>Joueurs</span><a id="wPlayers" data-addr="{{PLAYERS}}" target="_blank" rel="noreferrer"></a></div>
  </div>
</aside>

<aside id="pay" class="panel" hidden>
  <div>
    <h3>Comment ça marche</h3>
    <p>Chaque coup est une transaction sur Monad testnet (chaîne 10143), signée par la maison pour votre siège. 1 crédit = 0,0001 MON · mise minimum 10 crédits.</p>
  </div>
  <div>
    <h3>Blackjack</h3>
    <table>
      <tr><td>Blackjack</td><td>3 pour 2</td></tr>
      <tr><td>Main gagnante</td><td>1 pour 1</td></tr>
      <tr><td>Égalité</td><td>mise rendue</td></tr>
    </table>
    <p style="margin-top:6px">Contre le contrat · le croupier reste sur tous les 17 · doubler sur les 2 premières cartes · une séparation par main · une main par joueur.</p>
  </div>
  <div>
    <h3>Roulette européenne · un seul zéro</h3>
    <table>
      <tr><td>Plein (1 numéro)</td><td>35:1</td></tr>
      <tr><td>Douzaine</td><td>2:1</td></tr>
      <tr><td>Rouge/Noir · Pair/Impair · Manque/Passe</td><td>1:1</td></tr>
    </table>
    <p style="margin-top:6px">Table partagée : toutes les mises du tour sont réglées par le même lancer. Le zéro rafle les chances simples et les douzaines.</p>
  </div>
  <div>
    <h3>L'Envol</h3>
    <table>
      <tr><td>Encaisser à temps</td><td>mise × multiplicateur</td></tr>
      <tr><td>L'avion s'envole avant</td><td>mise perdue</td></tr>
      <tr><td>Progression</td><td>+2 % par bloc</td></tr>
    </table>
    <p style="margin-top:6px">Le point d'envol est engagé (commit-reveal) avant la première mise et révélé à l'envol. Le bloc où atterrit votre encaissement fixe le multiplicateur obtenu.</p>
  </div>
  <div>
    <h3>Pile ou face</h3>
    <table>
      <tr><td>Bonne face</td><td>1 pour 1</td></tr>
      <tr><td>Mauvaise face</td><td>mise perdue</td></tr>
    </table>
    <p style="margin-top:6px">Tirage fait par le contrat CoinFlip, en une seule transaction.</p>
  </div>
</aside>

<footer class="dock">
  <div class="dock-inner">
    <div class="row split">
      <div id="status">Ouverture des tables…</div>
      <div class="hint" id="tableInfo">Glisser pour tourner · molette pour zoomer</div>
    </div>
    <div class="row split">
      <div class="chips" id="chips" role="group" aria-label="Valeur du jeton"></div>

      <div class="actions" id="bjBar">
        <div class="seg" role="group" aria-label="Distribution des cartes"><button id="modeFast" aria-pressed="true">Rapide</button><button id="modeReal" aria-pressed="false">Réaliste</button></div>
        <span class="tally" id="bjTally"></span>
        <button class="btn" id="bjClear">Effacer</button>
        <button class="btn" id="bjRebet">Rejouer la mise</button>
        <button class="btn primary" id="bjDeal">Distribuer</button>
        <button class="btn" id="bjHit" hidden>Tirer</button>
        <button class="btn" id="bjStand" hidden>Rester</button>
        <button class="btn" id="bjDouble" hidden>Doubler</button>
        <button class="btn" id="bjSplit" hidden>Séparer</button>
      </div>

      <div class="actions" id="rlBar" hidden>
        <div id="history" aria-label="Derniers numéros"></div>
        <span class="tally" id="rlTally"></span>
        <button class="btn" id="rlUndo">Annuler</button>
        <button class="btn" id="rlClear">Effacer</button>
        <button class="btn" id="rlRebet">Rejouer</button>
        <button class="btn primary" id="rlSpin">Lancer la bille</button>
      </div>

      <div class="actions" id="crBar" hidden>
        <div id="crHist" aria-label="Derniers vols"></div>
        <div class="stepper"><button class="btn sq" id="crMinus" aria-label="Baisser la mise">−</button><span class="tally">Mise <b id="crStake">50</b></span><button class="btn sq" id="crPlus" aria-label="Augmenter la mise">+</button></div>
        <label class="auto"><input type="checkbox" id="crAutoOn"> Auto <input id="crAuto" type="number" min="1.01" step="0.01" value="2.00" aria-label="Multiplicateur d'encaissement automatique"></label>
        <button class="btn primary" id="crMain">Miser 50</button>
      </div>

      <div class="actions" id="cfBar" hidden>
        <div id="cfHist" aria-label="Derniers lancers"></div>
        <div class="stepper"><button class="btn sq" id="cfMinus" aria-label="Baisser la mise">−</button><span class="tally">Mise <b id="cfStake">50</b></span><button class="btn sq" id="cfPlus" aria-label="Augmenter la mise">+</button></div>
        <button class="btn primary" id="cfFace">Face</button>
        <button class="btn primary" id="cfPile">Pile</button>
      </div>
    </div>
  </div>
</footer>

<div id="join" hidden>
  <form id="joinForm" autocomplete="off">
    <h2>Prenez place</h2>
    <p>Pas de wallet, pas de clé : la maison vous ouvre un siège on-chain avec 500 crédits.</p>
    <input id="nick" maxlength="24" placeholder="Votre pseudo" aria-label="Pseudo">
    <button class="btn primary" id="joinBtn" type="submit">S'asseoir</button>
    <div id="joinErr" role="alert"></div>
    <button class="btn" id="joinSkip" type="button">Regarder sans jouer</button>
  </form>
</div>

<div id="intro">
  <div class="intro-inner">
    <div class="eyebrow" data-split>Salon on-chain · Monad testnet</div>
    <div class="title" data-split>Riviera</div>
    <p class="sub">Blackjack contre le contrat, roulette européenne partagée, L'Envol qui grimpe de 2 % à chaque bloc, et pile ou face. Chaque mise est une vraie transaction, signée par la maison : pas de wallet, juste un pseudo. Croupier, cartes, bille et pièce en 3D.</p>
    <button id="hold" aria-label="Maintenir pour entrer">
      <svg viewBox="0 0 112 112"><circle cx="56" cy="56" r="54" stroke="rgba(214,168,78,.22)"/><circle id="holdRing" cx="56" cy="56" r="54" stroke="#f3d48c" stroke-dasharray="339.3" stroke-dashoffset="339.3" stroke-linecap="round"/></svg>
      <span class="lbl">Maintenir</span>
    </button>
    <div id="loadmsg">Préparation des tables…</div>
    <div class="fineprint">Monad testnet · jetons sans valeur réelle.</div>
  </div>
</div>
`;
