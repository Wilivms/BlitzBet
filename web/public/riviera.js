/* BlitzBet · Casino Riviera — front 3D branché sur les contrats Monad (routes /api). */
(function start(n){
if(!window.THREE){if(n<300){setTimeout(()=>start(n+1),50);return;}var m=document.getElementById('loadmsg');if(m)m.textContent='Impossible de charger le moteur 3D. Rechargez la page.';return;}
if(window.__riviera)return;window.__riviera=true;
(()=>{
'use strict';
/* ---- A_helpers ---- */
const $=s=>document.querySelector(s);
const fmt=n=>(Math.round(n*10)/10).toLocaleString('fr-FR',{maximumFractionDigits:1});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const ease={io:t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,out:t=>1-Math.pow(1-t,3),expo:t=>t===1?1:1-Math.pow(2,-10*t),lin:t=>t};
function rnd(n){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n;}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- découpe de texte lettre par lettre ---------- */
function splitInto(el,text,stagger=.035,delay=0){
  el.textContent='';
  [...text].forEach((c,i)=>{const s=document.createElement('span');s.className='ch';s.textContent=c===' '?' ':c;s.style.animationDelay=(delay+i*stagger)+'s';el.appendChild(s);});
}
document.querySelectorAll('[data-split]').forEach((el,i)=>splitInto(el,el.textContent,i?0.07:0.02,i?0.25:0));

if(!window.THREE){$('#loadmsg').textContent='Impossible de charger le moteur 3D. Rechargez la page.';return;}

/* ---------- tweens ---------- */
const tweens=[];
function tween(dur,fn,e=ease.io){return new Promise(res=>tweens.push({t:0,dur,fn,e,res}));}
const wait=s=>tween(s,()=>{});
function stepTweens(dt){for(let i=tweens.length-1;i>=0;i--){const w=tweens[i];w.t+=dt;const k=Math.min(1,w.t/w.dur);w.fn(w.e(k),k);if(k>=1){tweens.splice(i,1);w.res();}}}

/* ---------- moteur ---------- */
const stage=$('#stage');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
const MOBILE=matchMedia('(max-width:700px)').matches||matchMedia('(pointer:coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio,MOBILE?1.5:2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0d0a08);
scene.fog=new THREE.Fog(0x0d0a08,13,30);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.05,90);
const col=h=>new THREE.Color(h).convertSRGBToLinear();
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const tmpV=new THREE.Vector3();

function canvasTex(w,h,draw,opts={}){
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  if(opts.repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(opts.repeat[0],opts.repeat[1]);}
  return t;
}
function addNoise(g,w,h,amt){const d=g.getImageData(0,0,w,h),a=d.data;for(let i=0;i<a.length;i+=4){const n=(Math.random()-.5)*amt;a[i]+=n;a[i+1]+=n;a[i+2]+=n;}g.putImageData(d,0,0);}
function rrect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function arcText(g,text,cx,cy,r,font,color,spacing=0){
  g.save();g.font=font;g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';
  const chars=[...text];const ws=chars.map(ch=>g.measureText(ch).width+spacing);const total=ws.reduce((a,b)=>a+b,0);
  let a=Math.PI/2+total/r/2;
  chars.forEach((ch,i)=>{const ca=a-ws[i]/r/2;g.save();g.translate(cx+r*Math.cos(ca),cy+r*Math.sin(ca));g.rotate(ca-Math.PI/2);g.fillText(ch,0,0);g.restore();a-=ws[i]/r;});
  g.restore();
}
function drawSuit(g,s,x,y,size,ink,flip){
  g.save();g.translate(x,y);if(flip)g.rotate(Math.PI);g.scale(size,size);g.fillStyle=ink;g.beginPath();
  if(s==='H'){g.moveTo(0,.5);g.bezierCurveTo(-.1,.4,-.5,.15,-.5,-.15);g.bezierCurveTo(-.5,-.42,-.22,-.55,0,-.3);g.bezierCurveTo(.22,-.55,.5,-.42,.5,-.15);g.bezierCurveTo(.5,.15,.1,.4,0,.5);}
  else if(s==='D'){g.moveTo(0,-.5);g.lineTo(.38,0);g.lineTo(0,.5);g.lineTo(-.38,0);g.closePath();}
  else if(s==='S'){g.moveTo(0,-.5);g.bezierCurveTo(-.1,-.4,-.5,-.18,-.5,.1);g.bezierCurveTo(-.5,.36,-.22,.46,-.04,.28);g.lineTo(-.16,.52);g.lineTo(.16,.52);g.lineTo(.04,.28);g.bezierCurveTo(.22,.46,.5,.36,.5,.1);g.bezierCurveTo(.5,-.18,.1,-.4,0,-.5);}
  else{[[0,-.25],[-.25,.06],[.25,.06]].forEach(([cx,cy])=>{g.moveTo(cx+.21,cy);g.arc(cx,cy,.21,0,Math.PI*2);});g.moveTo(.12,0);g.arc(0,0,.12,0,Math.PI*2);g.moveTo(-.05,.08);g.lineTo(-.16,.52);g.lineTo(.16,.52);g.lineTo(.05,.08);}
  g.fill();g.restore();
}

/* ---------- constantes de jeu ---------- */
const FELT=0.9, BJX=-5.2, RX=5.7;
const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const STEP=Math.PI*2/37;
const colorOf=n=>n===0?'green':RED.has(n)?'red':'black';
const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
/* ---- A2_chain ---- */
// Jetons exprimés en crédits : 1 crédit = 0,0001 MON. La mise minimum des contrats est 0,001 MON = 10 crédits.
const CHIPS=[{v:10,c:'#ece6d8',e:'#2e6cb3',t:'#1b2a3c'},{v:25,c:'#b5232d',e:'#f4ead6',t:'#fff'},{v:50,c:'#1d7a45',e:'#f4ead6',t:'#fff'},{v:100,c:'#19181c',e:'#d9aa52',t:'#f3d48c'},{v:250,c:'#5a2a86',e:'#f3d48c',t:'#fff'},{v:500,c:'#d9781e',e:'#1b1a1e',t:'#fff'}];
let chip=25;
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* =========================================================
   CHAÎNE — Monad testnet, via les routes /api du serveur
   La maison signe chaque coup ; le joueur n'est qu'un siège bytes32.
   ========================================================= */
const RATE=10000;                                   // crédits par MON
const toCr=mon=>Math.round((+mon||0)*RATE);
const toMon=cr=>(Math.max(0,cr)/RATE).toFixed(4);
const MIN_BET=10;
const SEAT_KEY='blitzbet.seat';
const ME={seat:null,nick:''};
try{ME.seat=localStorage.getItem(SEAT_KEY);}catch(e){}
let bank=0;            // affiché = solde on-chain − mises posées mais pas encore envoyées
let chainBank=null;    // dernier solde lu sur la chaîne (crédits)
let inflight=0;        // mises envoyées dont la chaîne n'a pas encore rendu le solde
const CHAIN={ok:null,state:null,err:'',lastTx:null,stamp:0};

async function api(path,body){
  const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  let j;try{j=await r.json();}catch(e){throw new Error('Réponse illisible du serveur ('+r.status+')');}
  if(j&&j.error)throw new Error(cleanErr(j.error));
  if(j&&j.explorer)setTx(j.explorer);
  return j;
}
function cleanErr(m){
  m=String(m||'');
  const known=[['InsufficientChips','Solde insuffisant'],['WagerTooSmall','Mise trop faible (10 minimum)'],['RoundNotOpen','Le tour est fermé'],['RoundAlreadyOpen','Un tour est déjà ouvert'],
    ['WrongPhase','Trop tard pour ce tour'],['AlreadySeated','Vous êtes déjà à bord'],['AlreadyCashedOut','Déjà encaissé'],['NotSeated','Pas de mise sur ce vol'],['TableFull','Table complète'],
    ['HandInProgress','Une main est déjà en cours'],['NotSplittable','Séparation impossible'],['CannotDouble','Impossible de doubler'],['NoHand','Aucune main en cours'],['fetch failed','Réseau Monad injoignable']];
  for(const [k,v] of known)if(m.includes(k))return v;
  return m.split('\n')[0].slice(0,140);
}
function setTx(url){CHAIN.lastTx=url;const a=$('#txLink');if(a){a.href=url;a.hidden=false;}}

const mySeatIs=id=>!!id&&!!ME.seat&&String(id).toLowerCase()===ME.seat.toLowerCase();
function syncBank(){
  if(chainBank===null)return;
  const pend=(typeof localPending==='function'?localPending():0);
  setBank(chainBank-inflight-pend,true);
}
async function pollState(){
  try{
    const st=await api('/api/state');CHAIN.state=st;CHAIN.ok=true;CHAIN.stamp=Date.now();
    const me=ME.seat&&st.players.find(p=>mySeatIs(p.seatId));
    if(me){ME.nick=me.nickname;const v=toCr(me.chips);if(chainBank!==v){chainBank=v;inflight=0;}syncBank();}
    else if(ME.seat&&st.players.length&&!CHAIN.lostWarned){CHAIN.lostWarned=true;forgetSeat();}
    if(typeof onRouletteState==='function')onRouletteState(st.roulette);
    if(!$('#hist').hidden)renderHist();
  }catch(e){CHAIN.ok=false;CHAIN.err=e.message;}
  netPill();
}
// après une transaction, on relit tout de suite le solde (le cache serveur est invalidé)
async function afterTx(){inflight=0;await pollState();}
function forgetSeat(){try{localStorage.removeItem(SEAT_KEY);}catch(e){}ME.seat=null;chainBank=null;if(entered)askNickname();}
function netPill(){
  const pill=$('#netPill');if(!pill)return;
  const st=CHAIN.ok===null?'wait':CHAIN.ok?'on':'off';pill.dataset.st=st;
  pill.querySelector('span').textContent=st==='on'?`Monad testnet · ${CHAIN.state?CHAIN.state.players.length:0} joueurs`:st==='wait'?'Connexion…':'Chaîne injoignable';
}
// Mises au tapis : le solde affiché baisse tout de suite, la chaîne confirme ensuite
function needSeat(){if(ME.seat)return true;askNickname();return false;}
function canAfford(amt){
  if(!needSeat())return false;
  if(bank<amt){announce('Solde insuffisant',bank<MIN_BET?'Votre solde est épuisé':`Il vous reste ${fmt(bank)}`);return false;}
  return true;
}
const busy={bj:false,rl:false,cr:false,cf:false};
/* ---- B_scene ---- */

/* =========================================================
   CONSTRUCTION DE LA SCÈNE
   ========================================================= */
function build(){
  // environnement pour les reflets (laiton, bille, vernis)
  const pm=new THREE.PMREMGenerator(renderer);
  const env=new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10,32,16),new THREE.MeshBasicMaterial({color:0x2a1c12,side:THREE.BackSide})));
  [[0,8,0,6,.3,6],[6,3,-6,3,2,.3],[-6,3,6,3,2,.3],[0,3,-8,8,1.5,.3]].forEach(([x,y,z,w,h,d])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:0xffe1b3}));m.position.set(x,y,z);env.add(m);});
  scene.environment=pm.fromScene(env,.04).texture;

  // lumières
  scene.add(new THREE.HemisphereLight(col(0xffe6c4),col(0x1c120b),.5));
  const fill=new THREE.DirectionalLight(col(0xffd9a8),.35);fill.position.set(0,6,10);scene.add(fill);
  const spot=(x,z,ang)=>{const s=new THREE.SpotLight(col(0xffe2b4),2.4,0,ang,.55,0);s.position.set(x,6.6,z+1.1);s.target.position.set(x,FELT,z);s.castShadow=true;s.shadow.mapSize.set(MOBILE?1024:2048,MOBILE?1024:2048);s.shadow.bias=-.00025;s.shadow.camera.near=2;s.shadow.camera.far=14;scene.add(s,s.target);};
  spot(BJX,.7,.62);spot(RX,0,.72);

  // matériaux
  const woodTex=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#5b2914';g.fillRect(0,0,w,h);for(let i=0;i<170;i++){const y=Math.random()*h,a=Math.random()*.12;g.strokeStyle=Math.random()<.5?`rgba(28,9,3,${a+.05})`:`rgba(150,78,38,${a})`;g.lineWidth=1+Math.random()*3;g.beginPath();for(let x=0;x<=w;x+=16)g.lineTo(x,y+Math.sin(x*.01+i)*6+Math.sin(x*.043+i*2)*2);g.stroke();}addNoise(g,w,h,10);},{repeat:[2,1]});
  M.wood=new THREE.MeshStandardMaterial({map:woodTex,roughness:.32,metalness:.05});
  M.woodSide=new THREE.MeshStandardMaterial({map:woodTex,roughness:.32,metalness:.05,side:THREE.DoubleSide});
  M.leather=new THREE.MeshStandardMaterial({color:col(0x2a160e),roughness:.5,metalness:.05});
  M.brass=new THREE.MeshStandardMaterial({color:col(0xe0b260),roughness:.22,metalness:1});
  M.chrome=new THREE.MeshStandardMaterial({color:col(0xe9e9ee),roughness:.12,metalness:1});
  M.dark=new THREE.MeshStandardMaterial({color:col(0x141012),roughness:.3,metalness:.2});

  // sol moquette
  const carpet=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#3a0e15';g.fillRect(0,0,w,h);g.strokeStyle='rgba(217,170,82,.28)';g.lineWidth=3;for(let i=-1;i<=2;i++){g.beginPath();g.moveTo(i*w/2,0);g.lineTo(i*w/2+w/2,h/2);g.lineTo(i*w/2,h);g.stroke();g.beginPath();g.moveTo(i*w/2+w/2,0);g.lineTo(i*w/2,h/2);g.lineTo(i*w/2+w/2,h);g.stroke();}
    g.fillStyle='rgba(217,170,82,.32)';[[0,0],[w/2,h/2],[w,0],[0,h],[w,h]].forEach(([x,y])=>{g.beginPath();for(let k=0;k<8;k++){const a=k*Math.PI/4;g.lineTo(x+Math.cos(a)*(k%2?10:26),y+Math.sin(a)*(k%2?10:26));}g.fill();});addNoise(g,w,h,16);},{repeat:[16,16]});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({map:carpet,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);

  // murs : boiseries + appliques
  const wallTex=canvasTex(2048,512,(g,w,h)=>{g.fillStyle='#1e120b';g.fillRect(0,0,w,h);for(let i=0;i<16;i++){const x=i*w/16;g.strokeStyle='rgba(217,170,82,.22)';g.lineWidth=3;g.strokeRect(x+14,90,w/16-28,h-150);const gr=g.createRadialGradient(x+w/32,70,2,x+w/32,70,60);gr.addColorStop(0,'rgba(255,214,150,.95)');gr.addColorStop(1,'rgba(255,214,150,0)');g.fillStyle=gr;g.fillRect(x,0,w/16,160);}addNoise(g,w,h,8);},{repeat:[2,1]});
  const walls=new THREE.Mesh(new THREE.CylinderGeometry(17,17,9,72,1,true),new THREE.MeshBasicMaterial({map:wallTex,side:THREE.BackSide}));
  walls.position.y=4.5;scene.add(walls);

  // suspensions + cônes de lumière + poussière
  [[BJX,.7],[RX,0]].forEach(([x,z])=>{
    const g=new THREE.Group();g.position.set(x,4.7,z);
    const shade=new THREE.Mesh(new THREE.CylinderGeometry(.45,.95,.42,48,1,true),new THREE.MeshStandardMaterial({color:col(0xc9963f),roughness:.25,metalness:1,side:THREE.DoubleSide}));g.add(shade);
    const glow=new THREE.Mesh(new THREE.CircleGeometry(.92,48),new THREE.MeshBasicMaterial({color:0xffe3b0}));glow.rotation.x=Math.PI/2;glow.position.y=-.2;g.add(glow);
    const cord=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,5,6),M.dark);cord.position.y=2.7;g.add(cord);
    const cone=new THREE.Mesh(new THREE.CylinderGeometry(.9,3.6,3.7,48,1,true),new THREE.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:.045,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));cone.position.y=-2.05;g.add(cone);
    scene.add(g);
  });
  const N=420,pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){const left=i%2===0,cx=left?BJX:RX;const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*3;pos[i*3]=cx+Math.cos(a)*r;pos[i*3+1]=1.2+Math.random()*3.4;pos[i*3+2]=Math.sin(a)*r*.8;}
  const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(pos,3));
  dotTex=canvasTex(64,64,(g)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,236,200,1)');gr.addColorStop(1,'rgba(255,236,200,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);});
  dust=new THREE.Points(dg,new THREE.PointsMaterial({size:.035,map:dotTex,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending,color:0xffe2b8}));
  scene.add(dust);

  buildChips();
  buildCards();
  buildBlackjack();
  buildRoulette();
  buildCrash();
  buildCoin();
  scene.updateMatrixWorld(true);
  ARMS.forEach(a=>{a.rest=bj.localToWorld(a.restLocal.clone());a.target.copy(a.rest);});
}
const M={};
let dust,dotTex;

/* ---------- jetons ---------- */
const CHIP_R=.105,CHIP_H=.021;
let chipGeo;const chipMats={};
function buildChips(){
  chipGeo=new THREE.CylinderGeometry(CHIP_R,CHIP_R,CHIP_H,40);
  CHIPS.forEach(d=>{
    const top=canvasTex(256,256,(g)=>{g.fillStyle=d.c;g.beginPath();g.arc(128,128,128,0,7);g.fill();g.fillStyle=d.e;for(let i=0;i<8;i++){g.save();g.translate(128,128);g.rotate(i*Math.PI/4);g.fillRect(-15,-128,30,30);g.restore();}
      g.strokeStyle=d.e;g.lineWidth=4;g.setLineDash([10,8]);g.beginPath();g.arc(128,128,86,0,7);g.stroke();g.setLineDash([]);
      g.fillStyle=d.v===1?'rgba(0,0,0,.06)':'rgba(255,255,255,.07)';g.beginPath();g.arc(128,128,74,0,7);g.fill();
      g.fillStyle=d.t;g.font=`800 ${d.v>=1000?46:d.v>=100?60:72}px Figtree, sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(d.v,128,134);});
    const side=canvasTex(256,16,(g,w,h)=>{g.fillStyle=d.c;g.fillRect(0,0,w,h);g.fillStyle=d.e;for(let i=0;i<8;i++)g.fillRect(i*32+9,0,14,h);});
    const ms=new THREE.MeshStandardMaterial({map:side,roughness:.45}),mt=new THREE.MeshStandardMaterial({map:top,roughness:.4});
    chipMats[d.v]=[ms,mt,mt];
  });
  // sélecteur HTML
  const box=$('#chips');
  CHIPS.forEach(d=>{const b=document.createElement('button');b.className='chip'+(d.v>=1000?' k':'');b.style.setProperty('--c',d.c);b.style.setProperty('--e',d.e);b.style.color=d.t;b.innerHTML=`<span>${d.v>=1000?d.v/1000+'K':d.v}</span>`;b.setAttribute('aria-pressed',d.v===chip);b.setAttribute('aria-label',`Jeton de ${d.v}`);
    b.onclick=()=>{chip=d.v;box.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===b));};box.appendChild(b);});
}
function breakdown(amount){const out=[];let a=Math.floor(amount);for(const d of [...CHIPS].reverse())while(a>=d.v){out.push(d);a-=d.v;}if(!out.length&&amount>0)out.push(CHIPS[0]);return out;}
function buildStack(amount){
  const g=new THREE.Group();
  breakdown(amount).slice(0,20).forEach((d,i)=>{const m=new THREE.Mesh(chipGeo,chipMats[d.v]);m.position.set((Math.random()-.5)*.01,CHIP_H/2+i*CHIP_H,(Math.random()-.5)*.01);m.rotation.y=Math.random()*6.28;m.castShadow=true;m.receiveShadow=true;g.add(m);});
  g.userData.amount=amount;return g;
}
// animations de jetons
function arc(obj,to,dur,h=.15){const f=obj.position.clone();return tween(dur,k=>{obj.position.lerpVectors(f,to,k);obj.position.y+=Math.sin(Math.PI*k)*h;});}
async function collect(parent,stack,rack,sp=1){if(!stack)return;await arc(stack,rack,.55/sp,.12);await tween(.25/sp,k=>stack.scale.setScalar(1-k*.9));parent.remove(stack);}
async function sendHome(parent,stack,home,sp=1){if(!stack)return;const to=home.clone();to.x+=stack.position.x*.2;await arc(stack,to,.6/sp,.08);parent.remove(stack);}
async function payout(parent,stack,mult,rack,home,sp=1){
  if(!stack)return;
  const p=buildStack(stack.userData.amount*mult);p.position.copy(rack);parent.add(p);
  const to=stack.position.clone().add(V3(.24,0,0));
  await arc(p,to,.55/sp,.25);await wait(.75/sp);
  await Promise.all([sendHome(parent,stack,home,sp),sendHome(parent,p,home,sp)]);
}

/* ---------- cartes ---------- */
const CW=.32,CH=.45;
let cardGeo,edgeMat,backMat;const faceMats={};
const PIPS={2:[[.5,.2],[.5,.8]],3:[[.5,.2],[.5,.5],[.5,.8]],4:[[.3,.2],[.7,.2],[.3,.8],[.7,.8]],5:[[.3,.2],[.7,.2],[.5,.5],[.3,.8],[.7,.8]],
  6:[[.3,.2],[.7,.2],[.3,.5],[.7,.5],[.3,.8],[.7,.8]],7:[[.3,.2],[.7,.2],[.5,.35],[.3,.5],[.7,.5],[.3,.8],[.7,.8]],8:[[.3,.2],[.7,.2],[.5,.35],[.3,.5],[.7,.5],[.5,.65],[.3,.8],[.7,.8]],
  9:[[.3,.2],[.7,.2],[.3,.4],[.7,.4],[.5,.5],[.3,.6],[.7,.6],[.3,.8],[.7,.8]],10:[[.3,.2],[.7,.2],[.5,.3],[.3,.4],[.7,.4],[.3,.6],[.7,.6],[.5,.7],[.3,.8],[.7,.8]]};
function buildCards(){
  cardGeo=new THREE.BoxGeometry(CW,.004,CH);
  edgeMat=new THREE.MeshStandardMaterial({color:col(0xf1ece0),roughness:.6});
  const back=canvasTex(256,360,(g,w,h)=>{rrect(g,0,0,w,h,18);g.fillStyle='#f6f1e4';g.fill();rrect(g,12,12,w-24,h-24,10);g.fillStyle='#741521';g.fill();g.save();g.clip();g.strokeStyle='rgba(232,192,112,.5)';g.lineWidth=2;
    for(let i=-h;i<w+h;i+=18){g.beginPath();g.moveTo(i,0);g.lineTo(i+h,h);g.stroke();g.beginPath();g.moveTo(i,h);g.lineTo(i+h,0);g.stroke();}g.restore();
    g.strokeStyle='#e0b260';g.lineWidth=3;rrect(g,20,20,w-40,h-40,8);g.stroke();g.beginPath();g.arc(128,180,44,0,7);g.fillStyle='#741521';g.fill();g.stroke();
    g.fillStyle='#f0cd83';g.font='56px Limelight, Georgia, serif';g.textAlign='center';g.textBaseline='middle';g.fillText('R',128,184);});
  backMat=new THREE.MeshStandardMaterial({map:back,roughness:.45});
}
function faceMat(c){
  const k=c.r+c.s;if(faceMats[k])return faceMats[k];
  const red=c.s==='H'||c.s==='D',ink=red?'#bd2530':'#16151a';
  const t=canvasTex(256,360,(g,w,h)=>{
    rrect(g,0,0,w,h,18);g.fillStyle='#fbf8f0';g.fill();g.strokeStyle='#d6ccb8';g.lineWidth=3;rrect(g,3,3,w-6,h-6,16);g.stroke();
    const corner=flip=>{g.save();if(flip){g.translate(w,h);g.rotate(Math.PI);}g.fillStyle=ink;g.font=`800 ${c.r==='10'?40:46}px Figtree, sans-serif`;g.textAlign='center';g.textBaseline='alphabetic';g.fillText(c.r,32,54);drawSuit(g,c.s,32,80,28,ink);g.restore();};
    corner(false);corner(true);
    if(c.r==='J'||c.r==='Q'||c.r==='K'){
      g.fillStyle=red?'#f6e3dc':'#e6e4ee';g.fillRect(64,46,128,268);g.strokeStyle=ink;g.lineWidth=3;g.strokeRect(64,46,128,268);
      g.strokeStyle='#d9aa52';g.lineWidth=2;g.strokeRect(70,52,116,256);
      drawSuit(g,c.s,128,92,34,ink);drawSuit(g,c.s,128,268,34,ink,true);
      g.fillStyle=ink;g.font='112px Limelight, Georgia, serif';g.textAlign='center';g.textBaseline='middle';g.fillText(c.r,128,186);
    }else if(c.r==='A'){drawSuit(g,c.s,128,180,c.s==='S'?130:110,ink);}
    else{PIPS[+c.r].forEach(([x,y])=>drawSuit(g,c.s,128+(x-.5)*250,180+(y-.5)*366,44,ink,y>.5));}
  });
  return faceMats[k]=new THREE.MeshStandardMaterial({map:t,roughness:.42});
}
function cardMesh(c){const m=new THREE.Mesh(cardGeo,[edgeMat,edgeMat,faceMat(c),backMat,edgeMat,edgeMat]);m.castShadow=true;m.receiveShadow=true;return m;}

/* =========================================================
   TABLE DE BLACKJACK + CROUPIER
   ========================================================= */
const bj=new THREE.Group();bj.position.x=BJX;scene.add(bj);
const BJ_R=3.3,BJ_Z0=-.3,BJS=1024/BJ_R;
const NSEAT=5,SEAT_R=2.2,CARD_R=1.62,SIDE_R=2.66,SPOT_R=[.25,.15,.15];
const seatAng=i=>(2-i)*.52;               // place 1 = à la gauche du croupier (côté sabot)
const polar=(r,a,y=FELT)=>V3(r*Math.sin(a),y,BJ_Z0+r*Math.cos(a));
const tanOf=a=>V3(Math.cos(a),0,-Math.sin(a));
function spotPos(s,k){const a=seatAng(s);return k===0?polar(SEAT_R,a):polar(SIDE_R,a+(k===1?-.13:.13));}
const SHOE_MOUTH=V3(.9,FELT+.14,-.1),DISCARD=V3(-1.08,FELT,-.02);
const BJ_RACK=V3(0,FELT+.06,-.16);
const homeOf=s=>polar(3.75,seatAng(s),FELT+.05);
const L=.6;const ARMS=[];let ARM_L,ARM_R,dealerHead;const spotHits=[];let spotRing,turnRing,shoeDeck,discardPile;const seatRings=[];

function buildBlackjack(){
  const C=p=>[1024+p.x*BJS,1024+(p.z-BJ_Z0)*BJS];
  const feltTex=canvasTex(2048,2048,(g)=>{
    const gr=g.createRadialGradient(1024,1024,80,1024,1024,1100);gr.addColorStop(0,'#137852');gr.addColorStop(1,'#0a4630');g.fillStyle=gr;g.fillRect(0,0,2048,2048);addNoise(g,2048,2048,14);
    g.strokeStyle='rgba(232,196,120,.55)';g.lineWidth=5;g.beginPath();g.arc(1024,1024,3.08*BJS,0,Math.PI);g.stroke();
    g.lineWidth=2;g.beginPath();g.arc(1024,1024,3.0*BJS,0,Math.PI);g.stroke();
    arcText(g,'BLACKJACK PAIE 3 POUR 2',1024,1024,1.0*BJS,'58px Limelight, Georgia, serif','#e9c47a',4);
    arcText(g,'LE CROUPIER RESTE SUR TOUS LES 17',1024,1024,1.19*BJS,'600 28px Figtree, sans-serif','rgba(242,233,214,.75)',6);
    for(let s=0;s<NSEAT;s++){const a=seatAng(s);
      [0].forEach(k=>{const [x,y]=C(spotPos(s,k)),r=SPOT_R[k]*BJS;
        g.strokeStyle='#e7c27a';g.lineWidth=k?4:6;g.beginPath();g.arc(x,y,r,0,7);g.stroke();
        g.lineWidth=2;g.beginPath();g.arc(x,y,r-(k?9:14),0,7);g.stroke();
        g.save();g.translate(x,y);g.rotate(-a);g.textAlign='center';g.textBaseline='middle';
        g.fillStyle='#e7c27a';g.font=`${k?19:32}px Limelight, Georgia, serif`;g.fillText(['MISE','PAIRES','21+3'][k],0,r*.56);
        if(!k){g.font='600 20px Figtree, sans-serif';g.fillStyle='rgba(242,233,214,.55)';g.fillText('PLACE '+(s+1),0,-r*.52);}
        g.restore();});
    }
  });
  const felt=new THREE.Mesh(new THREE.CircleGeometry(BJ_R,128,Math.PI,Math.PI),new THREE.MeshStandardMaterial({map:feltTex,roughness:.95}));
  felt.rotation.x=-Math.PI/2;felt.position.set(0,FELT,BJ_Z0);felt.receiveShadow=true;bj.add(felt);
  const rail=new THREE.Mesh(new THREE.TorusGeometry(BJ_R+.1,.12,18,128,Math.PI),M.leather);rail.rotation.x=Math.PI/2;rail.position.set(0,FELT+.03,BJ_Z0);rail.castShadow=true;bj.add(rail);
  [-1,1].forEach(s=>{const cap=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),M.leather);cap.position.set(s*(BJ_R+.1),FELT+.03,BJ_Z0);bj.add(cap);});
  const skirt=new THREE.Mesh(new THREE.CylinderGeometry(BJ_R+.24,BJ_R+.12,.22,96,1,false,-Math.PI/2,Math.PI),M.wood);skirt.position.set(0,FELT-.13,BJ_Z0);skirt.castShadow=true;bj.add(skirt);
  const back=new THREE.Mesh(new THREE.BoxGeometry(2*(BJ_R+.24),.2,.2),M.wood);back.position.set(0,FELT-.06,BJ_Z0-.1);bj.add(back);
  const base=new THREE.Mesh(new THREE.BoxGeometry(2.4,.8,1),M.dark);base.position.set(0,.4,.9);bj.add(base);
  // tabourets devant chaque place
  const seatMat=new THREE.MeshStandardMaterial({color:col(0x4a1a1e),roughness:.55});
  for(let s=0;s<NSEAT;s++){const p=polar(4.05,seatAng(s),0);const st=new THREE.Group();st.position.copy(p);
    const cush=new THREE.Mesh(new THREE.CylinderGeometry(.24,.22,.1,28),seatMat);cush.position.y=.78;cush.castShadow=true;st.add(cush);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.2,.012,8,28),M.brass);ring.rotation.x=Math.PI/2;ring.position.y=.3;st.add(ring);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.72,10),M.brass);pole.position.y=.37;st.add(pole);
    const foot=new THREE.Mesh(new THREE.CylinderGeometry(.2,.22,.03,24),M.dark);foot.position.y=.015;st.add(foot);bj.add(st);}

  // rack du croupier
  const tray=new THREE.Mesh(new THREE.BoxGeometry(1.5,.05,.22),M.dark);tray.position.set(0,FELT+.025,-.17);bj.add(tray);
  for(let i=0;i<10;i++){const d=CHIPS[i%5];const t=canvasTex(64,128,(g,w,h)=>{g.fillStyle=d.c;g.fillRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.35)';for(let y=0;y<h;y+=8)g.fillRect(0,y,w,1.5);g.fillStyle=d.e;g.fillRect(20,0,10,h);});
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.068,.068,.19,24),new THREE.MeshStandardMaterial({map:t,roughness:.45}));m.rotation.x=Math.PI/2;m.position.set(-.64+i*.142,FELT+.115,-.17);m.castShadow=true;bj.add(m);}

  // sabot (le paquet restant rétrécit au fil de la partie)
  const shoe=new THREE.Group();shoe.position.set(1.04,FELT,.06);shoe.rotation.y=.55;
  const sb=new THREE.Mesh(new THREE.BoxGeometry(.32,.18,.5),new THREE.MeshStandardMaterial({color:col(0x0e0d10),roughness:.15,metalness:.3}));sb.position.y=.09;sb.castShadow=true;shoe.add(sb);
  shoeDeck=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,.38),[edgeMat,edgeMat,backMat,edgeMat,edgeMat,edgeMat]);shoeDeck.position.set(0,.13,.02);shoeDeck.rotation.x=-.18;shoe.add(shoeDeck);
  const lip=new THREE.Mesh(new THREE.BoxGeometry(.33,.02,.06),M.brass);lip.position.set(0,.04,-.25);shoe.add(lip);
  bj.add(shoe);
  // bac de défausse et pile de cartes jouées
  const disc=new THREE.Mesh(new THREE.BoxGeometry(.38,.22,.52),new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.14,roughness:.05,metalness:.1,depthWrite:false}));disc.position.set(DISCARD.x,FELT+.11,DISCARD.z);bj.add(disc);
  discardPile=new THREE.Mesh(new THREE.BoxGeometry(.3,.2,.44),[edgeMat,edgeMat,backMat,edgeMat,edgeMat,edgeMat]);discardPile.position.set(DISCARD.x,FELT+.005,DISCARD.z);discardPile.scale.y=.001;bj.add(discardPile);

  // zones cliquables : 5 places × (mise, paires, 21+3)
  for(let s=0;s<NSEAT;s++)[0].forEach(k=>{const p=spotPos(s,k);const m=new THREE.Mesh(new THREE.CircleGeometry(SPOT_R[k],32),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(p.x,FELT+.004,p.z);m.userData.spot={s,k};bj.add(m);spotHits.push(m);});
  spotRing=new THREE.Mesh(new THREE.RingGeometry(.97,1.07,48),new THREE.MeshBasicMaterial({color:0xffd98c,transparent:true,opacity:.85,depthWrite:false}));spotRing.rotation.x=-Math.PI/2;spotRing.visible=false;bj.add(spotRing);
  turnRing=new THREE.Mesh(new THREE.RingGeometry(.3,.34,48),new THREE.MeshBasicMaterial({color:0xffd98c,transparent:true,opacity:.8,depthWrite:false}));turnRing.rotation.x=-Math.PI/2;turnRing.scale.set(1,1.35,1);turnRing.visible=false;bj.add(turnRing);
  for(let s=0;s<NSEAT;s++){const p=spotPos(s,0);const r=new THREE.Mesh(new THREE.RingGeometry(.27,.3,48),new THREE.MeshBasicMaterial({color:0xffd98c,transparent:true,opacity:.9,depthWrite:false}));r.rotation.x=-Math.PI/2;r.position.set(p.x,FELT+.005,p.z);r.visible=false;bj.add(r);seatRings.push(r);}

  buildDealer();
}

function buildDealer(){
  const g=new THREE.Group();g.position.set(0,0,-.95);
  const shirt=new THREE.MeshStandardMaterial({color:col(0xeee8dc),roughness:.7});
  const vest=new THREE.MeshStandardMaterial({color:col(0x1d1a24),roughness:.55});
  const skin=new THREE.MeshStandardMaterial({color:col(0xc69173),roughness:.6});
  const hair=new THREE.MeshStandardMaterial({color:col(0x221711),roughness:.8});
  const red=new THREE.MeshStandardMaterial({color:col(0x8e1b26),roughness:.45});
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.27,.23,.82,28),vest);torso.scale.z=.62;torso.position.y=1.11;torso.castShadow=true;g.add(torso);
  const legs=new THREE.Mesh(new THREE.CylinderGeometry(.21,.18,.72,20),vest);legs.scale.z=.7;legs.position.y=.36;g.add(legs);
  const front=new THREE.Mesh(new THREE.BoxGeometry(.12,.4,.02),shirt);front.position.set(0,1.3,.158);front.rotation.x=-.06;g.add(front);
  [-.05,.05].forEach(x=>{const b=new THREE.Mesh(new THREE.SphereGeometry(.012,8,6),M.brass);b.position.set(x*1.9,1.14,.15);g.add(b);});
  const sh=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.56,16),shirt);sh.rotation.z=Math.PI/2;sh.position.y=1.47;sh.scale.set(1,1,.8);g.add(sh);
  [-1,1].forEach(s=>{const b=new THREE.Mesh(new THREE.SphereGeometry(.085,16,12),shirt);b.position.set(s*.28,1.47,0);g.add(b);});
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.075,.085,.06,20),shirt);collar.position.y=1.545;g.add(collar);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.055,.06,.12,16),skin);neck.position.y=1.6;g.add(neck);
  [-1,1].forEach(s=>{const w=new THREE.Mesh(new THREE.ConeGeometry(.032,.075,4),red);w.rotation.z=s*Math.PI/2;w.position.set(s*.038,1.535,.085);g.add(w);});
  const knot=new THREE.Mesh(new THREE.SphereGeometry(.018,10,8),red);knot.position.set(0,1.535,.088);g.add(knot);
  const head=new THREE.Group();head.position.y=1.77;g.add(head);
  const skull=new THREE.Mesh(new THREE.SphereGeometry(.13,28,20),skin);skull.scale.set(.92,1.08,.98);skull.castShadow=true;head.add(skull);
  const hr=new THREE.Mesh(new THREE.SphereGeometry(.137,28,16,0,Math.PI*2,0,Math.PI*.52),hair);hr.scale.set(.93,1.08,1);hr.rotation.x=-.32;hr.position.set(0,.012,-.01);head.add(hr);
  [-1,1].forEach(s=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.013,10,8),M.dark);e.position.set(s*.043,.022,.118);head.add(e);
    const ear=new THREE.Mesh(new THREE.SphereGeometry(.03,10,8),skin);ear.scale.set(.5,1,.8);ear.position.set(s*.12,0,0);head.add(ear);
    const brow=new THREE.Mesh(new THREE.BoxGeometry(.04,.008,.01),hair);brow.position.set(s*.044,.052,.12);head.add(brow);});
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.018,.05,10),skin);nose.rotation.x=Math.PI/2;nose.position.set(0,-.005,.135);head.add(nose);
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(.045,.006,.01),new THREE.MeshStandardMaterial({color:col(0x7a3d36)}));mouth.position.set(0,-.06,.12);head.add(mouth);
  dealerHead=head;
  [1,-1].forEach(s=>{
    const shoulder=new THREE.Group();shoulder.position.set(.28*s,1.47,0);g.add(shoulder);
    const up=new THREE.Group();shoulder.add(up);
    const ua=new THREE.Mesh(new THREE.CylinderGeometry(.058,.05,L,14),shirt);ua.rotation.x=Math.PI/2;ua.position.z=L/2;ua.castShadow=true;up.add(ua);
    const elbow=new THREE.Group();elbow.position.z=L;up.add(elbow);
    const ej=new THREE.Mesh(new THREE.SphereGeometry(.052,12,10),shirt);elbow.add(ej);
    const fa=new THREE.Mesh(new THREE.CylinderGeometry(.05,.04,L,14),shirt);fa.rotation.x=Math.PI/2;fa.position.z=L/2;fa.castShadow=true;elbow.add(fa);
    const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.046,.046,.04,14),M.brass);cuff.rotation.x=Math.PI/2;cuff.position.z=L-.04;elbow.add(cuff);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.05,14,10),skin);hand.scale.set(1.05,.55,1.35);hand.position.z=L+.02;hand.castShadow=true;elbow.add(hand);
    const arm={shoulder,up,elbow,hand,target:new THREE.Vector3(),anim:null,restLocal:V3(.24*s,FELT+.08,-.44)};
    ARMS.push(arm);if(s===1)ARM_L=arm;else ARM_R=arm;
  });
  bj.add(g);
}
function moveArm(arm,to,dur){if(arm.anim)arm.anim.res();const from=arm.target.clone();return new Promise(res=>{arm.anim={from,to:to.clone(),t:0,dur,res};});}
function rest(arm,dur=.4){return moveArm(arm,arm.rest,dur);}
const headLook=new THREE.Vector3(BJX,FELT,1.5);let held=null;
function updateArms(dt,t){
  ARMS.forEach(a=>{
    if(a.anim){const n=a.anim;n.t+=dt;const k=Math.min(1,n.t/n.dur),e=ease.io(k);a.target.lerpVectors(n.from,n.to,e);a.target.y+=Math.sin(Math.PI*k)*.07;if(k>=1){a.anim=null;n.res();}}
    a.shoulder.lookAt(a.target);a.shoulder.getWorldPosition(tmpV);
    const d=tmpV.distanceTo(a.target),ang=Math.acos(clamp(d/(2*L),0,1));
    a.up.rotation.x=ang;a.elbow.rotation.x=-2*ang;
  });
  // respiration + regard
  const busy=ARM_L.anim||ARM_R.anim;
  const look=busy?(ARM_L.anim?ARM_L.target:ARM_R.target):V3(BJX+Math.sin(t*.3)*.6,FELT+.4,2.4);
  headLook.lerp(look,1-Math.exp(-dt*4));dealerHead.lookAt(headLook);
  dealerHead.position.y=1.77+Math.sin(t*1.6)*.004;
  bj.updateMatrixWorld(true);
  if(held){ARM_L.hand.getWorldPosition(tmpV);bj.worldToLocal(tmpV);held.position.set(tmpV.x,tmpV.y-.035,tmpV.z);}
}
function releasePoint(arm,destW){
  arm.shoulder.getWorldPosition(tmpV);const s=tmpV.clone();const dir=destW.clone().sub(s);const d=dir.length();
  const p=s.add(dir.normalize().multiplyScalar(Math.min(d,2*L*.95)));p.y=Math.max(p.y,FELT+.07);return p;
}

/* =========================================================
   ROULETTE EUROPÉENNE
   ========================================================= */
const rl=new THREE.Group();rl.position.x=RX;scene.add(rl);
const U=.32,LX=1.12,LZ=.1;
const WHEEL_POS=V3(-2.5,FELT,.05);
let rotor,ball,layoutPlane,ghost,dolly;
const RL_RACK=V3(.3,FELT+.06,-1.3);
const layoutLocal=(ux,uy,y=FELT)=>V3(LX+(ux-7)*U,y,LZ+(uy-2.5)*U);
const BR=.021;
function surfaceY(r){if(r>=.82)return .062+(r-.82)/.175*.063;if(r>=.8)return .045+(r-.8)/.02*.017;return .045;}

function buildRoulette(){
  const feltT=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#0f5c3e';g.fillRect(0,0,w,h);addNoise(g,w,h,16);},{repeat:[6,3]});
  const top=new THREE.Mesh(new THREE.PlaneGeometry(7.6,3.2),new THREE.MeshStandardMaterial({map:feltT,roughness:.95}));top.rotation.x=-Math.PI/2;top.position.y=FELT;top.receiveShadow=true;rl.add(top);
  [[0,1.69,8.0,.22],[0,-1.69,8.0,.22]].forEach(([x,z,w,d])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,.14,d),M.leather);b.position.set(x,FELT+.04,z);b.castShadow=true;rl.add(b);});
  [-3.9,3.9].forEach(x=>{const b=new THREE.Mesh(new THREE.BoxGeometry(.22,.14,3.6),M.leather);b.position.set(x,FELT+.04,0);b.castShadow=true;rl.add(b);});
  const skirt=new THREE.Mesh(new THREE.BoxGeometry(8.1,.26,3.62),M.wood);skirt.position.y=FELT-.145;skirt.castShadow=true;rl.add(skirt);
  [-2.6,2.6].forEach(x=>{const p=new THREE.Mesh(new THREE.BoxGeometry(1.2,.78,1.6),M.dark);p.position.set(x,.39,0);rl.add(p);});
  // rack du croupier
  const tray=new THREE.Mesh(new THREE.BoxGeometry(1.4,.05,.22),M.dark);tray.position.set(RL_RACK.x,FELT+.025,RL_RACK.z);rl.add(tray);

  // tapis
  const P=200;
  const lt=canvasTex(14*P,5*P,(g,w,h)=>{
    g.fillStyle='#0f6142';g.fillRect(0,0,w,h);addNoise(g,w,h,12);
    const ink='#efe2c0';g.strokeStyle=ink;g.lineWidth=5;g.textAlign='center';g.textBaseline='middle';
    const txt=(s,x,y,size,font='Limelight, Georgia, serif',c=ink,w='')=>{g.fillStyle=c;g.font=`${w} ${size}px ${font}`.trim();g.fillText(s,x,y);};
    g.beginPath();g.moveTo(P,3);g.lineTo(.42*P,3);g.lineTo(.06*P,1.5*P);g.lineTo(.42*P,3*P);g.lineTo(P,3*P);g.closePath();g.fillStyle='#13834f';g.fill();g.stroke();
    txt('0',.6*P,1.5*P,96);
    for(let c=0;c<12;c++)for(let r=0;r<3;r++){const n=3*c+3-r,x=(1+c)*P,y=r*P;g.strokeRect(x,y,P,P);
      g.fillStyle=RED.has(n)?'#a8222c':'#17161a';rrect(g,x+26,y+30,P-52,P-60,22);g.fill();txt(String(n),x+P/2,y+P/2+4,92);}
    for(let r=0;r<3;r++){g.strokeRect(13*P,r*P,P,P);txt('2 à 1',13.5*P,(r+.5)*P,50,'Figtree, sans-serif',ink,'800');}
    ['1re 12','2e 12','3e 12'].forEach((s,d)=>{g.strokeRect((1+4*d)*P,3*P,4*P,P);txt(s,(3+4*d)*P,3.5*P,72);});
    const outs=['MANQUE','PAIR','','','IMPAIR','PASSE'];
    outs.forEach((s,k)=>{const x=(1+2*k)*P;g.strokeRect(x,4*P,2*P,P);
      if(k===2||k===3){g.fillStyle=k===2?'#b3232e':'#131216';g.beginPath();g.moveTo(x+P,4.15*P);g.lineTo(x+1.6*P,4.5*P);g.lineTo(x+P,4.85*P);g.lineTo(x+.4*P,4.5*P);g.closePath();g.fill();g.stroke();}
      else{txt(s,x+P,4.45*P,64);txt(k===0?'1 – 18':k===5?'19 – 36':'',x+P,4.78*P,32,'Figtree, sans-serif','rgba(239,226,192,.7)','600');}});
    g.lineWidth=8;g.strokeRect(4,4,w-8,h-8);
  });
  layoutPlane=new THREE.Mesh(new THREE.PlaneGeometry(14*U,5*U),new THREE.MeshStandardMaterial({map:lt,roughness:.92}));
  layoutPlane.rotation.x=-Math.PI/2;layoutPlane.position.set(LX,FELT+.002,LZ);layoutPlane.receiveShadow=true;rl.add(layoutPlane);
  ghost=new THREE.Mesh(chipGeo,new THREE.MeshBasicMaterial({color:0xfff1cf,transparent:true,opacity:.4,depthWrite:false}));ghost.visible=false;rl.add(ghost);
  dolly=new THREE.Group();const dc=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,.14,24),M.chrome);dc.position.y=.07;dolly.add(dc);const dt=new THREE.Mesh(new THREE.SphereGeometry(.05,20,14),M.brass);dt.position.y=.16;dolly.add(dt);dolly.traverse(o=>o.castShadow=true);dolly.visible=false;rl.add(dolly);

  // cylindre
  const wheel=new THREE.Group();wheel.position.copy(WHEEL_POS);rl.add(wheel);
  const lathe=(pts,mat,seg=128)=>{const m=new THREE.Mesh(new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),seg),mat);m.castShadow=true;m.receiveShadow=true;wheel.add(m);return m;};
  lathe([[1.24,-.01],[1.25,.12],[1.22,.2],[1.12,.215],[1.04,.205],[1.0,.18]],M.woodSide);
  const track=new THREE.MeshStandardMaterial({color:col(0x6b3a1e),roughness:.18,metalness:.05,side:THREE.DoubleSide});
  lathe([[1.0,.18],[.995,.125],[.82,.062],[.8,.05],[.8,0]],track);
  for(let i=0;i<8;i++){const a=i*Math.PI/4+.2,r=.9;const d=new THREE.Mesh(new THREE.OctahedronGeometry(.034),M.brass);d.scale.set(1,.35,.5);d.position.set(r*Math.cos(a),surfaceY(r)+.012,-r*Math.sin(a));d.rotation.y=a+(i%2?Math.PI/2:0);wheel.add(d);}
  rotor=new THREE.Group();wheel.add(rotor);
  const ringT=canvasTex(2048,2048,(g)=>{
    const c=1024,s=1024/.8;g.fillStyle='#2a160c';g.fillRect(0,0,2048,2048);
    WHEEL.forEach((n,i)=>{const a=i*STEP;const base=n===0?['#0d6e42','#13894f']:RED.has(n)?['#8e1a23','#b02530']:['#101012','#1e1d22'];
      g.beginPath();g.arc(c,c,.67*s,-a-STEP/2,-a+STEP/2);g.arc(c,c,.46*s,-a+STEP/2,-a-STEP/2,true);g.closePath();g.fillStyle=base[0];g.fill();
      g.beginPath();g.arc(c,c,.8*s,-a-STEP/2,-a+STEP/2);g.arc(c,c,.67*s,-a+STEP/2,-a-STEP/2,true);g.closePath();g.fillStyle=base[1];g.fill();
      g.save();g.translate(c+.735*s*Math.cos(-a),c+.735*s*Math.sin(-a));g.rotate(Math.PI/2-a);g.fillStyle='#f6ecd6';g.font='64px Limelight, Georgia, serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(n),0,0);g.restore();
      const b=-a+STEP/2;g.strokeStyle='#d9aa52';g.lineWidth=4;g.beginPath();g.moveTo(c+.67*s*Math.cos(b),c+.67*s*Math.sin(b));g.lineTo(c+.8*s*Math.cos(b),c+.8*s*Math.sin(b));g.stroke();});
    g.strokeStyle='#d9aa52';g.lineWidth=5;[.67,.8].forEach(r=>{g.beginPath();g.arc(c,c,r*s-2,0,7);g.stroke();});
  });
  const ring=new THREE.Mesh(new THREE.RingGeometry(.46,.8,148,1),new THREE.MeshStandardMaterial({map:ringT,roughness:.3,metalness:.05}));ring.rotation.x=-Math.PI/2;ring.position.y=.045;ring.receiveShadow=true;rotor.add(ring);
  const lip=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,.03,128,1,true),M.brass);lip.position.y=.035;rotor.add(lip);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.035,96,1,true),M.chrome);inner.position.y=.06;rotor.add(inner);
  const fretGeo=new THREE.BoxGeometry(.21,.032,.008);
  for(let i=0;i<37;i++){const a=i*STEP+STEP/2,r=.565;const f=new THREE.Mesh(fretGeo,M.chrome);f.position.set(r*Math.cos(a),.061,-r*Math.sin(a));f.rotation.y=a;f.castShadow=true;rotor.add(f);}
  const cone=new THREE.Mesh(new THREE.LatheGeometry([[.46,.046],[.42,.062],[.3,.1],[.16,.125],[0,.13]].map(p=>new THREE.Vector2(p[0],p[1])),96),M.woodSide);cone.castShadow=true;rotor.add(cone);
  const tur=new THREE.Mesh(new THREE.CylinderGeometry(.045,.07,.12,24),M.brass);tur.position.y=.18;rotor.add(tur);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(.045,20,14),M.brass);cap.position.y=.255;rotor.add(cap);
  for(let k=0;k<2;k++){const arm=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.46,10),M.brass);arm.rotation.z=Math.PI/2;arm.rotation.y=k*Math.PI/2;arm.position.y=.225;rotor.add(arm);
    [-1,1].forEach(s=>{const kn=new THREE.Mesh(new THREE.SphereGeometry(.026,14,10),M.brass);kn.position.set(k?0:s*.23,.225,k?s*.23:0);rotor.add(kn);});}
  ball=new THREE.Mesh(new THREE.SphereGeometry(BR,24,16),new THREE.MeshStandardMaterial({color:col(0xfbf9f3),roughness:.1,metalness:0}));ball.castShadow=true;wheel.add(ball);
}

/* =========================================================
   L'ENVOL — l'avion qui monte jusqu'à exploser
   ========================================================= */
const crash=new THREE.Group();crash.position.set(0,0,-7.2);scene.add(crash);
const GX0=-3.1,GY0=1.2,GW=6.1,GH=3.2,MAXS=420;
let plane,prop,trail,fill,boom,boomVel,flash,crashLight;
function buildCrash(){
  const stg=new THREE.Mesh(new THREE.BoxGeometry(8.6,.32,2.6),M.dark);stg.position.set(0,.16,.7);stg.receiveShadow=true;crash.add(stg);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(8.7,.05,2.7),M.brass);edge.position.set(0,.335,.7);crash.add(edge);
  const sx=x=>(x+3.6)/7.2,sy=y=>(4.85-y)/4.2;
  const bg=canvasTex(2048,1196,(g,w,h)=>{
    const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#1b0d0c');gr.addColorStop(1,'#080505');g.fillStyle=gr;g.fillRect(0,0,w,h);
    const rg=g.createRadialGradient(w*.3,h*.85,10,w*.3,h*.85,w*.6);rg.addColorStop(0,'rgba(200,50,40,.22)');rg.addColorStop(1,'rgba(200,50,40,0)');g.fillStyle=rg;g.fillRect(0,0,w,h);
    // rayons tournants imprimés
    g.save();g.translate(sx(GX0)*w,sy(GY0)*h);for(let i=0;i<18;i++){g.rotate(-Math.PI/2/18);g.fillStyle=i%2?'rgba(255,255,255,.015)':'rgba(217,170,82,.025)';g.beginPath();g.moveTo(0,0);g.lineTo(2400,-60);g.lineTo(2400,60);g.fill();}g.restore();
    g.strokeStyle='rgba(217,170,82,.12)';g.lineWidth=2;
    for(let i=0;i<=10;i++){const x=sx(GX0+GW*i/10)*w;g.beginPath();g.moveTo(x,sy(GY0)*h);g.lineTo(x,sy(GY0+GH)*h);g.stroke();}
    for(let i=0;i<=6;i++){const y=sy(GY0+GH*i/6)*h;g.beginPath();g.moveTo(sx(GX0)*w,y);g.lineTo(sx(GX0+GW)*w,y);g.stroke();}
    g.strokeStyle='rgba(243,212,140,.55)';g.lineWidth=4;g.beginPath();g.moveTo(sx(GX0)*w,sy(GY0+GH)*h);g.lineTo(sx(GX0)*w,sy(GY0)*h);g.lineTo(sx(GX0+GW)*w,sy(GY0)*h);g.stroke();
    addNoise(g,w,h,10);
  });
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(7.2,4.2),new THREE.MeshBasicMaterial({map:bg,toneMapped:false}));screen.position.set(0,2.75,0);crash.add(screen);
  const neon=new THREE.MeshBasicMaterial({color:0xff5240,toneMapped:false});
  const halo=new THREE.MeshBasicMaterial({color:0xff4030,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false});
  [[0,4.87,7.3,.04],[0,.63,7.3,.04],[-3.63,2.75,.04,4.28],[3.63,2.75,.04,4.28]].forEach(([x,y,w,h])=>{
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,.04),neon);b.position.set(x,y,.03);crash.add(b);
    const gl=new THREE.Mesh(new THREE.PlaneGeometry(w+.35,h+.35),halo);gl.position.set(x,y,.02);crash.add(gl);});
  const frame=new THREE.Mesh(new THREE.BoxGeometry(7.6,4.6,.18),M.wood);frame.position.set(0,2.75,-.1);crash.add(frame);
  const signT=canvasTex(1024,256,(g,w,h)=>{g.textAlign='center';g.textBaseline='middle';g.font='150px Limelight, Georgia, serif';g.shadowColor='rgba(255,80,60,.95)';g.shadowBlur=40;g.fillStyle='#ffd7c8';g.fillText("L'ENVOL",w/2,h/2+8);g.shadowBlur=12;g.fillText("L'ENVOL",w/2,h/2+8);});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.2,.8),new THREE.MeshBasicMaterial({map:signT,transparent:true,toneMapped:false,depthWrite:false}));sign.position.set(0,5.45,.05);crash.add(sign);
  [-4,4].forEach(x=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1,12),M.brass);p.position.set(x,.82,1.8);crash.add(p);const t=new THREE.Mesh(new THREE.SphereGeometry(.07,14,10),M.brass);t.position.set(x,1.34,1.8);crash.add(t);});

  // l'avion
  plane=new THREE.Group();
  const red=new THREE.MeshStandardMaterial({color:col(0xd02a33),roughness:.3,metalness:.35,emissive:col(0x300404)});
  const ivory=new THREE.MeshStandardMaterial({color:col(0xf2ead8),roughness:.35,emissive:col(0x1a1612)});
  const glass=new THREE.MeshStandardMaterial({color:col(0x9fd0ff),roughness:.05,metalness:.6,emissive:col(0x0a1a2a)});
  const fus=new THREE.Mesh(new THREE.CylinderGeometry(.075,.045,.62,18),red);fus.rotation.z=-Math.PI/2;plane.add(fus);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(.076,16,12),ivory);nose.position.x=.31;nose.scale.x=.7;plane.add(nose);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(.22,.014,.86),ivory);wing.position.set(.05,-.02,0);plane.add(wing);
  const wing2=wing.clone();wing2.position.y=.11;wing2.scale.set(.9,1,.85);plane.add(wing2);
  [-.3,.3].forEach(z=>{const st=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,.13,6),M.brass);st.position.set(.05,.045,z);plane.add(st);});
  const fin=new THREE.Mesh(new THREE.BoxGeometry(.13,.17,.014),red);fin.position.set(-.27,.09,0);plane.add(fin);
  const stab=new THREE.Mesh(new THREE.BoxGeometry(.11,.012,.32),ivory);stab.position.set(-.27,.01,0);plane.add(stab);
  const cockpit=new THREE.Mesh(new THREE.SphereGeometry(.05,14,10),glass);cockpit.position.set(.1,.07,0);plane.add(cockpit);
  prop=new THREE.Group();prop.position.x=.37;plane.add(prop);
  [0,Math.PI/2].forEach(r=>{const b=new THREE.Mesh(new THREE.BoxGeometry(.012,.3,.03),M.dark);b.rotation.x=r;prop.add(b);});
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.15,24),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.08,side:THREE.DoubleSide,depthWrite:false}));disc.rotation.y=Math.PI/2;prop.add(disc);
  plane.scale.setScalar(1.25);plane.rotation.y=-.18;crash.add(plane);
  crashLight=new THREE.PointLight(col(0xff6a4a),0,5,2);crash.add(crashLight);
  const fillLight=new THREE.SpotLight(col(0xffe2c0),1.3,0,.7,.6,0);fillLight.position.set(0,6,4);fillLight.target=plane;crash.add(fillLight);

  // traînée + aire sous la courbe
  const mkStrip=(color,op)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAXS*2*3),3));
    const idx=[];for(let i=0;i<MAXS-1;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}g.setIndex(idx);g.setDrawRange(0,0);
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,transparent:true,opacity:op,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));m.frustumCulled=false;crash.add(m);return m;};
  fill=mkStrip(0xe0352f,.2);trail=mkStrip(0xff6a55,1);

  // explosion
  const N=260;const bg2=new THREE.BufferGeometry();bg2.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));boomVel=new Float32Array(N*3);
  boom=new THREE.Points(bg2,new THREE.PointsMaterial({size:.16,map:dotTex,color:0xffa24a,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));boom.frustumCulled=false;crash.add(boom);
  flash=new THREE.Mesh(new THREE.SphereGeometry(.5,24,16),new THREE.MeshBasicMaterial({color:0xffd59a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));crash.add(flash);
}
/* ---- D_crash ---- */
/* ---------- L'Envol branché sur le contrat Aviator ----------
   Le multiplicateur est une fonction de la hauteur de bloc (+2 % par bloc) : l'avion avance
   au rythme de la chaîne, et le bloc où atterrit l'encaissement EST le multiplicateur obtenu.
   Le serveur révèle le point d'envol (commit-reveal) dès que la chaîne l'a dépassé. */
const GROW=.085,WAIT_S=7;
const CR={state:'idle',waitFull:WAIT_S,wait:0,t:0,m:1,crashAt:1,bet:0,stake:50,auto:0,cashed:false,cashM:0,ct:0,history:[],samples:[],boomT:9,
  round:0,phase:'idle',tick0:0,tickAt:0,blockMs:400,lastSample:null,seats:[],launchSent:0,seen:new Set(),lastPoll:0,pending:false};
const fmtM=m=>m.toFixed(2).replace('.',',')+'×';
function multAt(ticks){let bp=10000;for(let i=0;i<ticks;i++){bp=Math.floor(bp*10200/10000);if(bp>=1e6)return 100;}return bp/10000;}
function graphPos(t,m,xs,ys){return V3(GX0+GW*t/xs,GY0+GH*(m-1)/(ys-1),.02);}
function startWait(left){
  CR.state='wait';CR.wait=left!=null?Math.max(0,left):WAIT_S;CR.waitFull=WAIT_S;CR.t=0;CR.m=1;CR.samples=[];CR.cashed=false;CR.cashM=0;
  plane.visible=true;plane.position.copy(V3(GX0+.25,GY0+.12,.3));plane.rotation.z=0;
  trail.geometry.setDrawRange(0,0);fill.geometry.setDrawRange(0,0);
  $('#crashMult').className='';refresh();
}
function toGround(){
  CR.state='idle';plane.visible=true;plane.position.copy(V3(GX0+.25,GY0+.12,.3));plane.rotation.z=0;
  trail.geometry.setDrawRange(0,0);fill.geometry.setDrawRange(0,0);$('#crashMult').className='';refresh();
}
function takeoff(){
  if(CR.state!=='wait')startWait(0);
  CR.state='fly';CR.t=0;CR.m=1;CR.samples=[[0,1]];CR.crashAt=Infinity;
  CR.auto=$('#crAutoOn').checked?Math.max(1.01,parseFloat($('#crAuto').value)||0):0;
  refresh();
}
function markCashed(m){
  if(CR.cashed)return;CR.cashed=true;CR.cashM=m;$('#crashMult').className='cashed';
  announce(`Encaissé à ${fmtM(m)}`,`+${fmt(CR.bet*m-CR.bet)} · réglé à l'envol`,2400);refresh();
}
function explode(m){
  CR.state='crash';CR.ct=0;CR.boomT=0;CR.crashAt=m;CR.m=m;
  const p=plane.position;const a=boom.geometry.attributes.position.array;
  for(let i=0;i<boomVel.length/3;i++){a[i*3]=p.x;a[i*3+1]=p.y;a[i*3+2]=p.z;const th=Math.random()*Math.PI*2,ph=Math.acos(Math.random()*2-1),s=.8+Math.random()*3.2;
    boomVel[i*3]=Math.sin(ph)*Math.cos(th)*s;boomVel[i*3+1]=Math.sin(ph)*Math.sin(th)*s;boomVel[i*3+2]=Math.cos(ph)*s*.5;}
  boom.geometry.attributes.position.needsUpdate=true;flash.position.copy(p);plane.visible=false;if(game==='crash')shake=.35;
  $('#crashMult').className=CR.cashed?'cashed':'boom';
  if(game==='crash'){if(CR.bet&&!CR.cashed)announce(`Envolé à ${fmtM(m)}`,`Mise perdue −${fmt(CR.bet)}`,2600);else if(!CR.bet)announce(`Envolé à ${fmtM(m)}`,'',1600);}
  refresh();
}
function pushHist(round,m){if(CR.seen.has(round))return;CR.seen.add(round);CR.history.unshift(m);renderCrHist();}
function renderCrHist(){const h=$('#crHist');h.innerHTML='';CR.history.slice(0,8).forEach(m=>{const s=document.createElement('span');s.className='cm '+(m<2?'lo':m<10?'mid':'hi');s.textContent=fmtM(m);h.appendChild(s);});}
let shake=0;
function renderCrOthers(){
  const box=$('#crOthers');const names=new Map((CHAIN.state?CHAIN.state.players:[]).map(p=>[p.seatId.toLowerCase(),p.nickname]));
  const html=CR.seats.filter(s=>!mySeatIs(s.seatId)).slice(0,10).map(s=>{const nm=names.get(s.seatId.toLowerCase())||'Joueur';const ok=s.cashedOut;
    return `<span class="${ok?'ok':''}">${esc(nm)} · ${fmt(toCr(s.wager))}${ok?' → '+fmtM(multAt(s.cashOutTick)):''}</span>`;}).join('');
  if(box.innerHTML!==html)box.innerHTML=html;
}
function applyAviator(av){
  if(!av||av.error)return;
  const now=performance.now();
  CR.seats=av.seats||[];
  const mine=CR.seats.find(s=>mySeatIs(s.seatId));
  if(av.roundId!==CR.round){CR.round=av.roundId;CR.launchSent=0;CR.bet=0;CR.cashed=false;}
  if(mine){CR.bet=toCr(mine.wager);if(mine.cashedOut&&!CR.cashed)markCashed(multAt(mine.cashOutTick));}
  const prev=CR.phase;CR.phase=av.phase;
  if(av.phase==='betting'){
    if(CR.state!=='wait'){startWait(WAIT_S);CR.openedAt=now;}
  }else if(av.phase==='flying'){
    if(CR.state!=='fly')takeoff();
    if(CR.lastSample&&av.tick>CR.lastSample.tick){const ms=(now-CR.lastSample.at)/(av.tick-CR.lastSample.tick);if(ms>80&&ms<3000)CR.blockMs=CR.blockMs*.7+ms*.3;}
    if(!CR.lastSample||av.tick!==CR.lastSample.tick)CR.lastSample={tick:av.tick,at:now};
    CR.tick0=av.tick;CR.tickAt=now;
  }else{ // idle ou settled
    if(prev==='flying'||CR.state==='fly'){
      const m=av.lastCrash||CR.m;pushHist(av.roundId,m);explode(m);
      if(mine&&+mine.payout>0&&game==='crash')setTimeout(()=>announce(`Gain +${fmt(toCr(mine.payout)-CR.bet)}`,`Encaissé à ${fmtM(multAt(mine.cashOutTick))} · envolé à ${fmtM(m)}`,3000),900);
      afterTx();
    }else if(av.phase==='settled'&&av.lastCrash)pushHist(av.roundId,av.lastCrash);
    if(CR.state==='wait')toGround();
  }
}
async function pollAviator(){
  if(CR.polling)return;CR.polling=true;
  try{applyAviator(await api('/api/aviator'));}catch(e){}
  finally{CR.polling=false;}
}
async function crLaunch(){
  if(CR.launchSent===CR.round)return;CR.launchSent=CR.round;
  try{await api('/api/aviator',{action:'launch'});}catch(e){/* un autre joueur a déjà fait décoller l'avion */}
  pollAviator();
}
function updateCrash(dt,clock){
  prop.rotation.x+=dt*(CR.state==='fly'?60:CR.state==='wait'?18:0);
  if(CR.state==='wait'){
    CR.wait=Math.max(0,CR.wait-dt);plane.position.y=GY0+.12+Math.sin(clock*3)*.01;
    // le décollage est une transaction : n'importe quel joueur à bord l'envoie, les suivants échouent sans gravité
    const aboard=CR.seats.length>0,mineAboard=CR.seats.some(s=>mySeatIs(s.seatId));
    if(CR.wait<=0&&aboard&&(mineAboard||performance.now()-(CR.openedAt||0)>(WAIT_S+6)*1000))crLaunch();
  }
  else if(CR.state==='fly'){
    const est=CR.tick0+Math.min(4,(performance.now()-CR.tickAt)/CR.blockMs);
    CR.m=Math.max(CR.m,Math.pow(1.02,est));CR.t=Math.log(CR.m)/GROW;
    if(CR.bet&&!CR.cashed&&!CR.pending&&CR.auto&&CR.m>=CR.auto)crCashOut();
    const S=CR.samples,lastS=S[S.length-1];if(CR.t-lastS[0]>.05)S.push([CR.t,CR.m]);
    if(S.length>=MAXS-2){for(let i=1;i<S.length/2;i++)S.splice(i,1);}
    const xs=Math.max(10,CR.t*1.15),ys=Math.max(2.2,CR.m*1.18);
    const tp=trail.geometry.attributes.position.array,fp=fill.geometry.attributes.position.array;
    const pts=[...S.map(s=>graphPos(s[0],s[1],xs,ys)),graphPos(CR.t,CR.m,xs,ys)];
    pts.forEach((p,i)=>{tp.set([p.x,p.y-.022,.03,p.x,p.y+.022,.03],i*6);fp.set([p.x,GY0,.01,p.x,p.y,.01],i*6);});
    [trail,fill].forEach(o=>{o.geometry.attributes.position.needsUpdate=true;o.geometry.setDrawRange(0,(pts.length-1)*6);});
    const end=pts[pts.length-1],prev=pts[Math.max(0,pts.length-6)];
    const ang=clamp(Math.atan2(end.y-prev.y,Math.max(.001,end.x-prev.x)),0,.9);
    plane.position.set(end.x+.12,end.y+.1+Math.sin(clock*7)*.012,.3);plane.rotation.z=lerp(plane.rotation.z,ang*.85,1-Math.exp(-dt*6));
    crashLight.position.copy(plane.position);crashLight.intensity=1.4+Math.sin(clock*20)*.2;
  }else if(CR.state==='crash'){
    CR.ct+=dt;crashLight.intensity=Math.max(0,crashLight.intensity-dt*8);
    if(CR.ct>3.4&&CR.phase!=='betting'&&CR.phase!=='flying')toGround();
  }
  if(CR.boomT<2){CR.boomT+=dt;const a=boom.geometry.attributes.position.array;
    for(let i=0;i<a.length;i++){a[i]+=boomVel[i]*dt;boomVel[i]*=Math.exp(-dt*2.2);}for(let i=1;i<a.length;i+=3)boomVel[i]-=.9*dt;
    boom.geometry.attributes.position.needsUpdate=true;boom.material.opacity=Math.max(0,1-CR.boomT/1.6);boom.material.color.setHSL(.08-CR.boomT*.04,1,.6-CR.boomT*.15);
    const k=CR.boomT/.45;flash.material.opacity=Math.max(0,.9*(1-k));flash.scale.setScalar(.2+k*1.6);
    if(CR.boomT<.1){crashLight.position.copy(flash.position);crashLight.intensity=7;}}
  // sondage du contrat : rapide quand on regarde L'Envol, lent sinon
  const now=performance.now(),every=game==='crash'?(CR.state==='fly'?350:700):4000;
  if(now-CR.lastPoll>every){CR.lastPoll=now;pollAviator();}
  // HUD
  const hud=$('#crashHud');const show=game==='crash'&&entered&&view==='crash';hud.hidden=!show;
  if(show){
    tmpV.set(0,2.95,0);crash.localToWorld(tmpV);tmpV.project(camera);
    hud.style.left=((tmpV.x+1)/2*innerWidth)+'px';hud.style.top=((1-tmpV.y)/2*innerHeight)+'px';
    const mult=$('#crashMult'),sub=$('#crashSub'),bar=$('#crashBar');
    if(CR.state==='wait'){mult.textContent=fmtM(1);sub.textContent=CR.wait>0?`Décollage dans ${CR.wait.toFixed(1).replace('.',',')} s`:'Décollage… (transaction)';bar.parentNode.hidden=false;bar.style.width=(100*(1-CR.wait/CR.waitFull))+'%';}
    else if(CR.state==='idle'){mult.textContent=fmtM(1);sub.textContent='Au sol · misez pour ouvrir un vol';bar.parentNode.hidden=true;}
    else{bar.parentNode.hidden=true;mult.textContent=fmtM(CR.m);
      sub.textContent=CR.state==='crash'?(CR.cashed?`Encaissé à ${fmtM(CR.cashM)} · +${fmt(CR.bet*CR.cashM-CR.bet)}`:'Envolé'):CR.cashed?`Encaissé à ${fmtM(CR.cashM)} · +${fmt(CR.bet*CR.cashM-CR.bet)}`:CR.bet?`Gain potentiel ${fmt(CR.bet*CR.m)} · bloc ${Math.floor(CR.tick0)}`:`En vol · bloc ${Math.floor(CR.tick0)}`;}
    renderCrOthers();
  }
  const btn=$('#crMain');btn.disabled=CR.pending;
  if(CR.state==='fly'&&CR.bet&&!CR.cashed){btn.textContent=CR.pending?'Encaissement…':`Encaisser ${fmt(CR.bet*CR.m)}`;btn.classList.add('cash');}
  else{btn.classList.remove('cash');
    btn.textContent=CR.pending?'Transaction…':CR.state==='wait'?(CR.bet?`À bord · ${fmt(CR.bet)}`:`Miser ${fmt(CR.stake)}`):CR.state==='fly'||CR.state==='crash'?'Vol en cours':`Miser ${fmt(CR.stake)} et ouvrir un vol`;
    if(CR.state==='fly'||CR.state==='crash'||(CR.state==='wait'&&CR.bet))btn.disabled=true;}
}
async function crCashOut(){
  if(CR.pending||CR.cashed)return;CR.pending=true;
  try{const j=await api('/api/aviator',{action:'cashout',seatId:ME.seat});if(j.tick!=null)markCashed(multAt(j.tick));}
  catch(e){announce('Encaissement refusé',e.message,2600);}
  finally{CR.pending=false;pollAviator();}
}
async function crMain(){
  if(CR.pending)return;
  if(CR.state==='fly'&&CR.bet&&!CR.cashed)return crCashOut();
  if(CR.state==='fly'||CR.state==='crash'||CR.bet)return;
  if(!canAfford(CR.stake))return;
  CR.pending=true;inflight+=CR.stake;syncBank();
  try{
    if(CR.phase!=='betting'){
      try{await api('/api/aviator',{action:'open'});}catch(e){if(!/Trop tard|WrongPhase/.test(e.message))throw e;}
    }
    await api('/api/aviator',{action:'bet',seatId:ME.seat,wager:toMon(CR.stake)});
    CR.bet=CR.stake;status('Vous êtes à bord. Décollage imminent.');
  }catch(e){inflight=Math.max(0,inflight-CR.stake);syncBank();announce('Mise refusée',e.message,2600);}
  finally{CR.pending=false;await pollAviator();afterTx();}
}
$('#crMain').onclick=crMain;
$('#crPlus').onclick=()=>{CR.stake=Math.min(CR.stake+chip,100000);$('#crStake').textContent=fmt(CR.stake);};
$('#crMinus').onclick=()=>{CR.stake=Math.max(MIN_BET,CR.stake-chip);$('#crStake').textContent=fmt(CR.stake);};
addEventListener('keydown',e=>{if(game==='crash'&&e.code==='Space'&&entered&&!['INPUT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();crMain();}});
/* ---- D2_coin ---- */
/* =========================================================
   PILE OU FACE — guéridon, pièce de laiton, contrat CoinFlip
   Le tirage est fait par le contrat en une transaction : la pièce reste en l'air
   le temps que la chaîne réponde, puis retombe sur la face tirée.
   ========================================================= */
const CFX=0,CFZ=8.6;
const cf=new THREE.Group();cf.position.set(CFX,0,CFZ);scene.add(cf);
const CF_R=1.55,COIN_R=.36,COIN_H=.05,CF_REST=FELT+COIN_H/2+.035;
const CF_SPOT={0:V3(-.72,FELT,.55),1:V3(.72,FELT,.55)};      // 0 = Face, 1 = Pile (convention du contrat : 0 = heads)
const CF_RACK=V3(0,FELT+.06,-1.05),CF_HOME=V3(0,FELT+.05,1.9);
let coin,coinShadow;const cfHits=[];let cfRing;
function coinTex(face){
  return canvasTex(512,512,(g,w)=>{
    const c=w/2;const gr=g.createRadialGradient(c*.8,c*.7,20,c,c,c);gr.addColorStop(0,'#f8dc98');gr.addColorStop(.6,'#d9aa52');gr.addColorStop(1,'#8f6524');
    g.fillStyle=gr;g.beginPath();g.arc(c,c,c,0,7);g.fill();
    g.strokeStyle='rgba(90,58,18,.75)';g.lineWidth=10;g.beginPath();g.arc(c,c,c-14,0,7);g.stroke();
    g.lineWidth=3;g.setLineDash([4,9]);g.beginPath();g.arc(c,c,c-34,0,7);g.stroke();g.setLineDash([]);
    g.fillStyle='rgba(90,58,18,.85)';g.textAlign='center';g.textBaseline='middle';
    if(face){
      // profil stylisé et laurier
      for(let i=0;i<14;i++){const a=Math.PI*.62+i*.11,r=c-70;g.save();g.translate(c+r*Math.cos(a),c+r*Math.sin(a));g.rotate(a+Math.PI/2);g.beginPath();g.ellipse(0,0,7,16,.5,0,7);g.fill();g.restore();
        const b=Math.PI*.38-i*.11;g.save();g.translate(c+r*Math.cos(b),c+r*Math.sin(b));g.rotate(b+Math.PI/2);g.beginPath();g.ellipse(0,0,7,16,-.5,0,7);g.fill();g.restore();}
      g.font='190px Limelight, Georgia, serif';g.fillText('R',c,c-6);
      g.font='800 40px Figtree, sans-serif';g.fillText('FACE',c,c+128);
    }else{
      g.font='210px Limelight, Georgia, serif';g.fillText('2',c,c-4);
      g.font='800 40px Figtree, sans-serif';g.fillText('PILE',c,c+128);
      g.font='600 30px Figtree, sans-serif';g.fillText('RIVIERA · MONAD',c,c-128);
    }
    addNoise(g,w,w,8);
  });
}
function buildCoin(){
  const felt=canvasTex(1024,1024,(g,w,h)=>{
    const gr=g.createRadialGradient(w/2,h/2,40,w/2,h/2,w*.55);gr.addColorStop(0,'#6a1a26');gr.addColorStop(1,'#3a0d15');g.fillStyle=gr;g.fillRect(0,0,w,h);addNoise(g,w,h,12);
    g.strokeStyle='rgba(231,194,122,.6)';g.lineWidth=5;g.beginPath();g.arc(w/2,h/2,w*.47,0,7);g.stroke();g.lineWidth=2;g.beginPath();g.arc(w/2,h/2,w*.455,0,7);g.stroke();
    g.textAlign='center';g.textBaseline='middle';
    arcText(g,'PILE OU FACE · PAIE 1 POUR 1',w/2,h/2,w*.39,'40px Limelight, Georgia, serif','#e9c47a',3);
    [[0,'FACE'],[1,'PILE']].forEach(([k,lbl])=>{const p=CF_SPOT[k];const x=w/2+p.x/CF_R*w/2,y=h/2+p.z/CF_R*h/2,r=.3/CF_R*w/2;
      g.strokeStyle='#e7c27a';g.lineWidth=6;g.beginPath();g.arc(x,y,r,0,7);g.stroke();g.lineWidth=2;g.beginPath();g.arc(x,y,r-14,0,7);g.stroke();
      g.fillStyle='#e7c27a';g.font='34px Limelight, Georgia, serif';g.fillText(lbl,x,y+r*.55);});
  });
  const top=new THREE.Mesh(new THREE.CircleGeometry(CF_R,96),new THREE.MeshStandardMaterial({map:felt,roughness:.95}));top.rotation.x=-Math.PI/2;top.position.y=FELT;top.receiveShadow=true;cf.add(top);
  const rail=new THREE.Mesh(new THREE.TorusGeometry(CF_R+.06,.08,16,96),M.leather);rail.rotation.x=Math.PI/2;rail.position.y=FELT+.025;rail.castShadow=true;cf.add(rail);
  const wood=new THREE.Mesh(new THREE.CylinderGeometry(CF_R+.12,CF_R+.06,.18,96,1,true),M.woodSide);wood.position.y=FELT-.09;cf.add(wood);
  const under=new THREE.Mesh(new THREE.CylinderGeometry(CF_R+.1,CF_R+.1,.02,64),M.dark);under.position.y=FELT-.18;cf.add(under);
  const ped=new THREE.Mesh(new THREE.CylinderGeometry(.22,.5,FELT-.2,24),M.dark);ped.position.y=(FELT-.2)/2;ped.castShadow=true;cf.add(ped);
  const foot=new THREE.Mesh(new THREE.CylinderGeometry(.62,.66,.04,32),M.brass);foot.position.y=.02;cf.add(foot);
  // coussin de velours sous la pièce
  const cush=new THREE.Mesh(new THREE.CylinderGeometry(.5,.54,.035,48),new THREE.MeshStandardMaterial({color:col(0x1c1018),roughness:.85}));cush.position.set(0,FELT+.018,-.15);cush.receiveShadow=true;cf.add(cush);
  // rack du croupier
  const tray=new THREE.Mesh(new THREE.BoxGeometry(1.1,.05,.22),M.dark);tray.position.set(CF_RACK.x,FELT+.025,CF_RACK.z);cf.add(tray);
  for(let i=0;i<7;i++){const d=CHIPS[i%6];const t=canvasTex(64,128,(g,w,h)=>{g.fillStyle=d.c;g.fillRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.35)';for(let y=0;y<h;y+=8)g.fillRect(0,y,w,1.5);g.fillStyle=d.e;g.fillRect(20,0,10,h);});
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.068,.068,.19,24),new THREE.MeshStandardMaterial({map:t,roughness:.45}));m.rotation.x=Math.PI/2;m.position.set(-.43+i*.142,FELT+.115,CF_RACK.z);m.castShadow=true;cf.add(m);}
  // la pièce
  const edge=canvasTex(512,32,(g,w,h)=>{g.fillStyle='#b8873a';g.fillRect(0,0,w,h);g.fillStyle='rgba(70,44,12,.6)';for(let x=0;x<w;x+=6)g.fillRect(x,0,2,h);});
  const metal=(map)=>new THREE.MeshStandardMaterial({map,roughness:.28,metalness:.85});
  coin=new THREE.Mesh(new THREE.CylinderGeometry(COIN_R,COIN_R,COIN_H,64),[metal(edge),metal(coinTex(true)),metal(coinTex(false))]);
  coin.castShadow=true;coin.position.set(0,CF_REST,-.15);cf.add(coin);
  coinShadow=new THREE.Mesh(new THREE.CircleGeometry(COIN_R*1.1,40),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0,depthWrite:false}));coinShadow.rotation.x=-Math.PI/2;coinShadow.position.set(0,FELT+.04,-.15);cf.add(coinShadow);
  // zones cliquables
  [0,1].forEach(k=>{const p=CF_SPOT[k];const m=new THREE.Mesh(new THREE.CircleGeometry(.3,32),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(p.x,FELT+.004,p.z);m.userData.cf=k;cf.add(m);cfHits.push(m);});
  cfRing=new THREE.Mesh(new THREE.RingGeometry(.3,.34,48),new THREE.MeshBasicMaterial({color:0xffd98c,transparent:true,opacity:.85,depthWrite:false}));cfRing.rotation.x=-Math.PI/2;cfRing.visible=false;cf.add(cfRing);
  // lumière
  const s=new THREE.SpotLight(col(0xffe2b4),2.3,0,.62,.5,0);s.position.set(CFX,6.2,CFZ+.8);s.target.position.set(CFX,FELT,CFZ);s.castShadow=true;s.shadow.mapSize.set(MOBILE?1024:2048,MOBILE?1024:2048);s.shadow.bias=-.00025;scene.add(s,s.target);
  const lamp=new THREE.Group();lamp.position.set(CFX,4.6,CFZ);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(.45,.95,.42,48,1,true),new THREE.MeshStandardMaterial({color:col(0xc9963f),roughness:.25,metalness:1,side:THREE.DoubleSide}));lamp.add(shade);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(.92,48),new THREE.MeshBasicMaterial({color:0xffe3b0}));glow.rotation.x=Math.PI/2;glow.position.y=-.2;lamp.add(glow);
  const cord=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,5,6),M.dark);cord.position.y=2.7;lamp.add(cord);scene.add(lamp);
}
const CF={stake:50,state:'idle',spin:0,stack:null,choice:null,hist:[],fall:null};
const faceName=k=>k===0?'Face':'Pile';
function renderCfHist(){const h=$('#cfHist');h.innerHTML='';CF.hist.slice(0,8).forEach(k=>{const s=document.createElement('span');s.className='cm '+(k===0?'mid':'lo');s.textContent=k===0?'F':'P';s.title=faceName(k);h.appendChild(s);});}
async function cfFlip(choice){
  if(CF.state!=='idle'||!canAfford(CF.stake))return;
  CF.state='air';CF.choice=choice;CF.spin=0;
  const amt=CF.stake;inflight+=amt;syncBank();
  // la mise se pose sur FACE ou PILE
  if(CF.stack)cf.remove(CF.stack);
  CF.stack=buildStack(amt);CF.stack.position.copy(CF_SPOT[choice]).setY(FELT+.003);cf.add(CF.stack);
  {const s=CF.stack,y0=s.position.y;s.position.y+=.25;tween(.45,e=>s.position.y=y0+.25*(1-e),ease.out);}
  // lancer : la pièce monte et tourne tant que la chaîne n'a pas répondu
  const y0=coin.position.y;
  tween(.55,k=>{coin.position.y=lerp(y0,FELT+1.25,k);},ease.out);
  status(`${faceName(choice)} · ${fmt(amt)} · la pièce est en l'air (transaction en cours)…`);refresh();
  let res;
  try{res=await api('/api/coinflip',{seatId:ME.seat,wager:toMon(amt),choice});}
  catch(e){
    inflight=Math.max(0,inflight-amt);syncBank();
    announce('Lancer refusé',e.message,2800);
    await cfLand(coin.rotation.x>Math.PI/2&&coin.rotation.x<Math.PI*1.5?1:0);
    if(CF.stack){sendHome(cf,CF.stack,CF_HOME);CF.stack=null;}
    CF.state='idle';refresh();return;
  }
  const r=res.result===1?1:0;
  await cfLand(r);
  CF.hist.unshift(r);renderCfHist();
  const st=CF.stack;CF.stack=null;
  if(res.won){announce(`${faceName(r)} !`,`Gagné · +${fmt(amt)}`,2600);await payout(cf,st,1,CF_RACK,CF_HOME);}
  else{announce(faceName(r),`Perdu · −${fmt(amt)}`,2400);await collect(cf,st,CF_RACK);}
  await afterTx();CF.state='idle';refresh();
}
async function cfLand(r){
  CF.state='fall';
  const rx0=coin.rotation.x,base=Math.ceil(rx0/(Math.PI*2))*Math.PI*2+Math.PI*2*3,target=base+(r===1?Math.PI:0);
  const y0=coin.position.y;
  await tween(1.05,k=>{coin.rotation.x=lerp(rx0,target,ease.out(k));const fall=ease.io(Math.min(1,k*1.25));
    coin.position.y=lerp(y0,CF_REST,fall)+(k>.8?Math.sin((k-.8)/.2*Math.PI)*.05:0);},ease.lin);
  coin.rotation.x=r===1?Math.PI:0;coin.position.y=CF_REST;shake=game==='coin'?.12:0;
}
function updateCoin(dt,t){
  if(CF.state==='air'){CF.spin=Math.min(26,CF.spin+dt*40);coin.rotation.x+=CF.spin*dt;coin.position.y=FELT+1.25+Math.sin(t*2.2)*.06;coin.rotation.z=Math.sin(t*1.3)*.15;}
  else if(CF.state==='idle'){coin.rotation.z*=.9;}
  const hgt=coin.position.y-CF_REST;coinShadow.material.opacity=hgt>.05?Math.max(.08,.45-hgt*.25):0;coinShadow.scale.setScalar(1+hgt*.4);
  if(cfRing.visible)cfRing.material.opacity=.55+.3*Math.sin(t*5);
}
$('#cfFace').onclick=()=>cfFlip(0);$('#cfPile').onclick=()=>cfFlip(1);
$('#cfPlus').onclick=()=>{CF.stake=Math.min(CF.stake+chip,100000);$('#cfStake').textContent=fmt(CF.stake);};
$('#cfMinus').onclick=()=>{CF.stake=Math.max(MIN_BET,CF.stake-chip);$('#cfStake').textContent=fmt(CF.stake);};
/* ---- C_camera ---- */
/* =========================================================
   CAMÉRA
   ========================================================= */
const VIEWS={
  intro:{t:V3(0,1.2,0),r:17,yaw:-.9,pitch:.42},
  bj:{t:V3(BJX,.95,.85),r:6.1,yaw:0,pitch:.74},
  rl:{t:V3(RX+.15,.9,.2),r:6.6,yaw:0,pitch:.8},
  wheel:{t:V3(RX-2.5,.98,.05),r:2.65,yaw:-.45,pitch:.85},
  crash:{t:V3(0,2.85,-7.2),r:7.4,yaw:0,pitch:.1},
  coin:{t:V3(CFX,FELT+.25,CFZ),r:5.2,yaw:0,pitch:.62},
};
let view='intro';const user={yaw:0,pitch:0,zoom:1};
const cam={t:VIEWS.intro.t.clone(),r:VIEWS.intro.r,yaw:VIEWS.intro.yaw,pitch:VIEWS.intro.pitch};
let camSpeed=3;
function goView(v,speed=2.6){view=v;user.yaw=0;user.pitch=0;user.zoom=1;camSpeed=speed;}
function updateCamera(dt,t){
  const V=VIEWS[view];const asp=innerWidth/innerHeight;const ak=asp<1.25?1+(1.25-asp)*1.15:1;
  const k=1-Math.exp(-dt*camSpeed);
  let yaw=V.yaw+user.yaw;if(view==='intro')yaw+=t*.05;
  const seated=false;
  const akv=seated?Math.min(ak,1.35):ak,pb=asp<.8&&!seated&&view!=='crash'&&view!=='intro'?.28:0;
  const tgt=asp<.8&&view==='rl'?V.t.clone().add(V3(.95,0,0)):V.t;   // en portrait, on cadre surtout le tapis de mises
  cam.t.lerp(tgt,k);cam.r=lerp(cam.r,V.r*akv*user.zoom,k);cam.yaw=lerp(cam.yaw,yaw,k);cam.pitch=lerp(cam.pitch,clamp(V.pitch+pb+user.pitch,.12,1.45),k);
  const cp=Math.cos(cam.pitch);
  camera.position.set(cam.t.x+cam.r*Math.sin(cam.yaw)*cp,cam.t.y+cam.r*Math.sin(cam.pitch),cam.t.z+cam.r*Math.cos(cam.yaw)*cp);
  if(shake>0){shake=Math.max(0,shake-dt);const s=shake*.12;camera.position.x+=(Math.random()-.5)*s;camera.position.y+=(Math.random()-.5)*s;}
  camera.lookAt(cam.t);
}
function resize(){
  renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;
  const dock=document.querySelector('.dock-inner').getBoundingClientRect().height+14,top=document.querySelector('.top').getBoundingClientRect().height;
  const off=document.body.classList.contains('in')?(dock-top)/2:0;
  camera.setViewOffset(innerWidth,innerHeight,0,Math.max(0,off),innerWidth,innerHeight);camera.updateProjectionMatrix();
}
addEventListener('resize',()=>{resize();if(entered)movePill();});
/* ---- D3_ui ---- */
/* =========================================================
   INTERFACE
   ========================================================= */
const banner=$('#banner');let bannerTimer;
function announce(big,small='',ms=2600){
  clearTimeout(bannerTimer);banner.innerHTML='<div class="big"></div><div class="small"></div>';
  splitInto(banner.firstChild,big,.028);banner.lastChild.textContent=small;
  bannerTimer=setTimeout(()=>{banner.querySelectorAll('.ch').forEach((c,i)=>{c.style.animationDelay=(i*.012)+'s';c.classList.add('out');});banner.lastChild.textContent='';},ms);
}
function status(s){$('#status').textContent=s;}
function setBank(v){const old=bank;bank=Math.round(v);const el=$('#bank');el.textContent=ME.seat&&chainBank!==null?fmt(bank):'—';
  if(bank!==old){el.classList.remove('up','down');void el.offsetWidth;el.classList.add(bank>old?'up':'down');setTimeout(()=>el.classList.remove('up','down'),700);}
  refresh();}
let game='bj';
const TABS={bj:'#tabBJ',rl:'#tabRL',crash:'#tabCR',coin:'#tabCF'};
function setGame(g){
  if(!TABS[g])g='bj';
  game=g;Object.entries(TABS).forEach(([k,id])=>$(id).setAttribute('aria-pressed',k===g));movePill();
  $('#bjBar').hidden=g!=='bj';$('#rlBar').hidden=g!=='rl';$('#crBar').hidden=g!=='crash';$('#cfBar').hidden=g!=='coin';
  goView(g==='rl'&&RL.spin?'wheel':g);ghost.visible=false;spotRing.visible=false;cfRing.visible=false;
  try{history.replaceState(null,'',g==='bj'?location.pathname:`?g=${g==='crash'?'aviator':g==='coin'?'coinflip':'roulette'}`);}catch(e){}
  const T={bj:['Blackjack','Contre le contrat · le croupier reste sur 17'],rl:['Roulette','Européenne · un seul zéro · table partagée'],crash:["L'Envol",'+2 % par bloc Monad · encaissez avant l\'envol'],coin:['Pile ou face','Double ou rien · une transaction']};
  announce(T[g][0],T[g][1],1600);
  if(g==='crash')pollAviator();
  refresh();
}
function movePill(){const b=$(TABS[game]);const p=$('#pill');p.style.left=b.offsetLeft+'px';p.style.width=b.offsetWidth+'px';}
Object.entries(TABS).forEach(([k,id])=>$(id).onclick=()=>setGame(k));
$('#netPill').onclick=()=>{
  if(CHAIN.ok)announce('Monad testnet · chaîne 10143',`${CHAIN.state.players.length} joueurs assis · bankroll ${Number(CHAIN.state.bankroll).toFixed(2)} MON`,4200);
  else if(CHAIN.ok===null)announce('Connexion à la chaîne…','Patientez quelques secondes',2600);
  else announce('Chaîne injoignable',CHAIN.err||'Réessayez dans un instant',5200);
};
$('#moreBtn').onclick=e=>{e.stopPropagation();const m=$('#more');m.classList.toggle('open');$('#moreBtn').setAttribute('aria-expanded',m.classList.contains('open'));};
$('#more').addEventListener('click',e=>{if(e.target.closest('button')&&matchMedia('(max-width:700px)').matches){$('#more').classList.remove('open');$('#moreBtn').setAttribute('aria-expanded',false);}});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#more,#moreBtn'))$('#more').classList.remove('open');});
$('#recenter').onclick=()=>{user.yaw=0;user.pitch=0;user.zoom=1;};
const placePanel=el=>{const t=document.querySelector('.top').getBoundingClientRect().bottom+6;el.style.top=t+'px';el.style.maxHeight=`calc(100% - ${t+150}px)`;};
$('#payBtn').onclick=()=>{const p=$('#pay');placePanel(p);p.hidden=!p.hidden;$('#payBtn').setAttribute('aria-expanded',!p.hidden);if(!p.hidden){$('#hist').hidden=true;$('#histBtn').setAttribute('aria-expanded',false);}};
$('#histBtn').onclick=()=>{const h=$('#hist');placePanel(h);h.hidden=!h.hidden;$('#histBtn').setAttribute('aria-expanded',!h.hidden);if(!h.hidden){$('#pay').hidden=true;$('#payBtn').setAttribute('aria-expanded',false);renderHist();pollState();}};

/* ---------- classement on-chain ---------- */
const signed=n=>(n>0?'+':n<0?'−':'')+fmt(Math.abs(n));
function renderHist(){
  const st=CHAIN.state;const tb=$('#histTable');tb.innerHTML='';
  $('#histNote').textContent=st?`Lu sur CasinoHub · bankroll de la maison ${Number(st.bankroll).toFixed(2)} MON`:'Lecture de la chaîne…';
  if(!st)return;
  const tr0=document.createElement('tr');['#','Joueur','Crédits','Gain'].forEach(c=>{const th=document.createElement('th');th.textContent=c;tr0.appendChild(th);});tb.appendChild(tr0);
  st.players.slice(0,30).forEach((p,i)=>{const tr=document.createElement('tr');if(mySeatIs(p.seatId))tr.className='me';
    const pnl=toCr(p.pnl);[String(i+1),(mySeatIs(p.seatId)?'Vous · ':'')+p.nickname,fmt(toCr(p.chips)),signed(pnl)].forEach((t,j)=>{const td=document.createElement('td');td.textContent=t;if(j===3)td.className=pnl>0?'pos':pnl<0?'neg':'';tr.appendChild(td);});tb.appendChild(tr);});
  if(!st.players.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.textContent='Personne n\'est encore assis.';tr.appendChild(td);tb.appendChild(tr);}
  const q=document.getElementById('qrSrc'),slot=$('#qrSlot');if(q&&slot&&!slot.firstChild){q.hidden=false;slot.appendChild(q);}
}

/* ---------- s'asseoir : pseudo → siège on-chain ---------- */
function askNickname(){
  const d=$('#join');if(!d.hidden)return;d.hidden=false;setTimeout(()=>$('#nick').focus(),60);
}
$('#joinForm').onsubmit=async e=>{
  e.preventDefault();const btn=$('#joinBtn'),err=$('#joinErr');if(btn.disabled)return;
  btn.disabled=true;btn.textContent='Transaction…';err.textContent='';
  try{
    const j=await api('/api/join',{nickname:$('#nick').value});
    ME.seat=j.seatId;ME.nick=j.nickname;try{localStorage.setItem(SEAT_KEY,j.seatId);}catch(_){}
    CHAIN.lostWarned=false;$('#join').hidden=true;
    await afterTx();
    announce(`Bienvenue, ${j.nickname}`,`${fmt(chainBank||0)} crédits vous attendent`,3000);
  }catch(x){err.textContent=x.message;}
  finally{btn.disabled=false;btn.textContent='S\'asseoir';}
};

/* ---------- wallets du casino, vérifiables sur l'explorateur ---------- */
['#wHouse','#wPlayers'].forEach(id=>{const a=$(id);const ad=a&&a.dataset.addr;if(!ad||ad.startsWith('{{')){if(a)a.parentNode.hidden=true;return;}
  a.href='https://testnet.monadexplorer.com/address/'+ad;a.textContent=ad.slice(0,6)+'…'+ad.slice(-4);});
// ?g=aviator|roulette|coinflip|blackjack : ouvre directement la bonne table (anciens liens /play/<jeu>)
const START_GAME=(()=>{const g=new URLSearchParams(location.search).get('g');return {aviator:'crash',crash:'crash',roulette:'rl',rl:'rl',coinflip:'coin',coin:'coin',blackjack:'bj',bj:'bj'}[g]||'bj';})();
/* ---- E_bjrules ---- */
/* =========================================================
   BLACKJACK — RÈGLES
   ========================================================= */
const ALPH='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',SUITS='SHDC';
const dec=ch=>{const i=ALPH.indexOf(ch);return {r:RANKS[i%13],s:SUITS[Math.floor(i/13)]};};
const decs=str=>[...str].filter(c=>c!=='?').map(dec);
function val(cards){let t=0,a=0;for(const c of cards){if(c.r==='A'){a++;t+=11;}else if(c.r==='J'||c.r==='Q'||c.r==='K'||c.r==='10')t+=10;else t+=+c.r;}while(t>21&&a){t-=10;a--;}return {t,soft:a>0};}
const cval=c=>c.r==='A'?11:['10','J','Q','K'].includes(c.r)?10:+c.r;
const tot=str=>val(decs(str)).t;
const natural=h=>h.c.length===2&&!h.sp&&tot(h.c)===21;
function htxt(str,nat){const cs=decs(str);if(!cs.length)return '';const v=val(cs);if(nat)return 'Blackjack';return v.soft&&v.t<21?`${v.t-10} / ${v.t}`:String(v.t);}
const SIDE_NAMES=[{25:'parfaite',12:'de couleur',6:'mixte'},{100:'brelan assorti',40:'quinte flush',30:'brelan',10:'suite',5:'couleur'}];
const RES_LBL={bj:'Blackjack',win:'Gagné',push:'Égalité',lose:'Perdu',bust:'Bust'};
/* ---- E2_bjchain ---- */
/* ---------- état de la table, piloté par le contrat Blackjack ----------
   Une main par joueur : le contrat tient la partie (deal, hit, stand, double, split) et
   tire les cartes. Le sabot on-chain ne connaît que les rangs ; la couleur affichée est
   dérivée de l'identifiant de partie, pour que la main reste stable d'un affichage à l'autre. */
const MEID='me';
const others=()=>[];
const nameOf=seat=>seat.o===MEID?(ME.nick||'Vous'):'Joueur';
function resolveNames(){}
const blankSeat=()=>({o:null,by:null,b:[0,0,0],h:[],sr:null,stk:0,paid:0,rdy:0});
let S={seq:0,round:1,mode:'fast',phase:'betting',seats:Array.from({length:NSEAT},blankSeat),dl:'',turn:null,tl:0,cd:-1,shoe:312,cut:70,sd:0,host:'chain'};
try{const m=localStorage.getItem('riviera-mode');if(m==='real'||m==='fast')S.mode=m;}catch(e){}
const BJ={game:null,seat:2,dealt:0,wasSplit:false};
function hashStr(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function code(gameId,key,rank){const r=Math.max(1,Math.min(13,rank|0));return ALPH[(hashStr(gameId+':'+key+':'+r)%4)*13+r-1];}
function handCodes(g,hi,cards){return cards.map((r,i)=>code(g.gameId,hi===1&&i===0?'p0_1':`p${hi}_${i}`,r)).join('');}
function resultOf(h,g){
  const w=+h.wager,p=+h.payout;
  if(p<=0)return h.total>21||h.state==='bust'?'bust':'lose';
  if(Math.abs(p-w)<1e-12)return 'push';
  if(!g.wasSplit&&h.cards.length===2&&h.total===21&&Math.abs(p*2-w*5)<1e-9)return 'bj';
  return 'win';
}
const clone=o=>JSON.parse(JSON.stringify(o));
function bjSeatOfMine(){return S.seats.findIndex(s=>s.o===MEID);}
function localPending(){
  let t=0;if(S.phase==='betting'){const i=bjSeatOfMine();if(i>=0)t+=S.seats[i].b[0];}
  if(typeof RL!=='undefined'&&RL.state==='betting')RL.bets.forEach(b=>t+=b.amount);
  return t;
}
function push(anim){S.seq++;renderState(clone(S),anim||null);}
const drain=()=>new Promise(r=>{const chk=()=>qLen===0?r():setTimeout(chk,80);chk();});

// Applique une partie lue sur la chaîne. Les cartes du joueur d'abord, puis celles du croupier,
// pour que l'animation suive l'ordre d'une vraie donne.
async function applyGame(g,{fresh=false}={}){
  const si=BJ.seat;const seat=S.seats[si];
  const wasSplit=!!g.wasSplit;
  seat.o=MEID;
  seat.h=g.hands.map((h,hi)=>({c:handCodes(g,hi,h.cards),bet:toCr(h.wager),d:h.state==='active'?0:1,r:'',sp:wasSplit?1:0,dbl:h.doubled?1:0}));
  seat.b[0]=seat.h.reduce((a,h)=>a+h.bet,0);
  const up=g.dealer.cards.length?code(g.gameId,'d0',g.dealer.cards[0]):'';
  if(!g.finished){
    S.phase='play';S.turn=[si,g.activeHand];
    if(fresh){push({k:'card'});await drain();}
    S.dl=up+'?';push({k:'card'});
    return;
  }
  // partie terminée : on montre d'abord la dernière carte du joueur, puis le croupier joue
  S.turn=null;S.phase='dealer';
  if(!S.dl)S.dl=up+'?';
  push({k:'card'});await drain();
  const full=g.dealer.cards.map((r,i)=>code(g.gameId,'d'+i,r)).join('');
  S.dl=full.length>=2?full:up+'?';
  if(full.length<2&&S.dl.endsWith('?'))S.dl=up;            // toutes les mains ont sauté : le croupier ne joue pas
  push({k:'reveal'});await drain();await bwait(.4);
  seat.h.forEach((h,hi)=>{h.r=resultOf(g.hands[hi],g);h.d=1;});
  S.phase='done';push({k:'settle'});
  afterTx();
  await bwait(4.2);await drain();
  S.round++;S.seats=S.seats.map(()=>blankSeat());S.dl='';S.turn=null;S.phase='betting';BJ.game=null;
  push({k:'clear'});
}
async function bjAct(action){
  if(busy.bj)return;busy.bj=true;refresh();
  try{
    const g=await api('/api/blackjack',{action,seatId:ME.seat});
    BJ.game=g;await applyGame(g);
  }catch(e){announce('Action refusée',e.message,2600);if(/Aucune main/.test(e.message))bjRestore();}
  finally{busy.bj=false;refresh();pollState();}
}
async function bjDeal(){
  const si=bjSeatOfMine();if(si<0||busy.bj||S.phase!=='betting')return;
  const amt=S.seats[si].b[0];if(amt<MIN_BET){announce('Mise trop faible',`Minimum ${MIN_BET}`);return;}
  if(!needSeat())return;
  busy.bj=true;BJ.seat=si;LAST_BETS=[[si,0,amt]];
  inflight+=amt;S.phase='deal';push({k:'start'});
  try{
    const g=await api('/api/blackjack',{action:'deal',seatId:ME.seat,wager:toMon(amt)});
    BJ.game=g;busy.bj=false;
    await applyGame(g,{fresh:true});
  }catch(e){
    inflight=Math.max(0,inflight-amt);
    S.phase='betting';push(null);announce('Donne refusée',e.message,2800);
  }finally{busy.bj=false;syncBank();refresh();}
}
// Une main restée ouverte (téléphone verrouillé, page rechargée) reprend où elle était
async function bjRestore(){
  if(!ME.seat)return;
  try{const g=await api('/api/blackjack?seatId='+encodeURIComponent(ME.seat));
    if(g&&g.gameId&&!g.finished){BJ.game=g;S.seats=S.seats.map(()=>blankSeat());S.dl='';await applyGame(g);if(game==='bj')announce('Main en cours','Reprenez où vous en étiez',2200);}
  }catch(e){}
}
/* ---- F_bjrender ---- */
/* =========================================================
   RENDU 3D DE L'ÉTAT (identique chez tous les joueurs)
   ========================================================= */
const BJ_SPEED=1.5;   // blackjack accéléré ×1,5 (cadence du croupier et animations)
const btween=(d,f,e)=>tween(d/BJ_SPEED,f,e),bwait=d=>wait(d/BJ_SPEED),bMoveArm=(a,t,d)=>moveArm(a,t,d/BJ_SPEED),brest=(a,d=.4)=>rest(a,d/BJ_SPEED);
let RS=null,LAST_BETS=null,SHUF=false;
const VIS={cards:new Map(),stacks:new Map()};
let animQ=Promise.resolve(),qLen=0;
function enqueue(fn){qLen++;animQ=animQ.then(fn).catch(e=>console.warn(e)).then(()=>{qLen--;});}
const W=v=>bj.localToWorld(v.clone());
function dealerPos(i){return V3(-.3+i*.26,FELT+.003+i*.004,.32);}
const handGap=nH=>nH<=2?.62:nH===3?.46:nH===4?.4:.34;
function handCardPos(s,h,nH,i){const a=seatAng(s),t=tanOf(a),n=V3(-Math.sin(a),0,-Math.cos(a));
  const p=polar(CARD_R,a).addScaledVector(t,(h-(nH-1)/2)*handGap(nH)+i*(nH>2?.07:.1)).addScaledVector(n,i*.075);p.y=FELT+.003+i*.004;return p;}
function makeCard(ch){
  const m=ch==='?'?new THREE.Mesh(cardGeo,[edgeMat,edgeMat,backMat,backMat,edgeMat,edgeMat]):cardMesh(dec(ch));
  m.castShadow=true;m.receiveShadow=true;m.userData.code=ch;return m;
}
function placeCard(m,w){m.position.copy(w.pos);m.rotation.set(0,w.ry,m.userData.code==='?'?Math.PI:0);m.visible=true;}
function moveCard(m,w){
  m.userData.w=w;if(!m.visible)return;
  if(m.position.distanceTo(w.pos)<.01&&Math.abs(m.rotation.y-w.ry)<.01)return;
  const f=m.position.clone(),r0=m.rotation.y;btween(.42,k=>{m.position.lerpVectors(f,w.pos,k);m.position.y+=Math.sin(Math.PI*k)*.08;m.rotation.y=lerp(r0,w.ry,k);});
}
function revealCard(m,ch,instant){
  m.material=[edgeMat,edgeMat,faceMat(dec(ch)),backMat,edgeMat,edgeMat];m.userData.code=ch;
  if(instant||!m.visible){m.rotation.z=0;return;}
  enqueue(async()=>{await bMoveArm(ARM_R,releasePoint(ARM_R,W(m.position)),.3);await flip(m);brest(ARM_R,.45);});
}
async function flip(m,to=0){const y0=m.position.y,rz=m.rotation.z;await btween(.3,k=>{m.rotation.z=lerp(rz,to,k);m.position.y=y0+Math.sin(Math.PI*k)*.13;});m.position.y=y0;}
async function animDeal(m,real){
  const w=m.userData.w,faceUp=m.userData.code!=='?';
  const sw=W(SHOE_MOUTH);
  if(real){
    // le croupier tire la carte du sabot et la fait glisser sur le tapis, puis la retourne
    await bMoveArm(ARM_L,sw,.28);
    m.position.set(SHOE_MOUTH.x,FELT+.006,SHOE_MOUTH.z);m.rotation.set(0,.55,Math.PI);m.visible=true;
    if(ARM_L.anim){const r=ARM_L.anim.res;ARM_L.anim=null;r();}
    const f=m.position.clone(),wv=new THREE.Vector3();
    await btween(.62,k=>{const d=m.userData.w.pos;m.position.lerpVectors(f,d,k);m.rotation.y=lerp(.55,m.userData.w.ry,k);
      wv.copy(m.position);bj.localToWorld(wv);const p=releasePoint(ARM_L,wv);p.y=FELT+.085;ARM_L.target.copy(p);},ease.io);
    if(faceUp)flip(m).then(()=>brest(ARM_L,.45));else brest(ARM_L,.45);
  }else{
    await bMoveArm(ARM_L,sw,.16);
    m.position.copy(SHOE_MOUTH);m.rotation.set(0,.55,Math.PI);m.visible=true;held=m;
    await bMoveArm(ARM_L,releasePoint(ARM_L,W(w.pos)),.2);held=null;
    const f=m.position.clone(),r0=m.rotation.y;
    await btween(.2,k=>{m.position.lerpVectors(f,m.userData.w.pos,k);m.rotation.y=lerp(r0,m.userData.w.ry,k);},ease.out);
    brest(ARM_L,.35);if(faceUp)flip(m);
  }
}
function syncCards(st,instant){
  const want=new Map();
  [...st.dl].forEach((ch,i)=>want.set('d'+i,{ch,seat:-1,pos:dealerPos(i),ry:0}));
  st.seats.forEach((s,si)=>{const nH=s.h.length;s.h.forEach((h,hi)=>[...h.c].forEach((ch,i)=>want.set(`c${si}_${hi}_${i}`,{ch,seat:si,pos:handCardPos(si,hi,nH,i),ry:seatAng(si)})));});
  const orphans=[];
  for(const [k,m] of [...VIS.cards]){const w=want.get(k);if(!w||(w.ch!==m.userData.code&&m.userData.code!=='?')||(w.ch==='?'&&m.userData.code!=='?')){orphans.push(m);VIS.cards.delete(k);}}
  for(const [k,w] of want){
    let m=VIS.cards.get(k);
    if(m){if(m.userData.code==='?'&&w.ch!=='?'){m.userData.w=w;revealCard(m,w.ch,instant);}else moveCard(m,w);continue;}
    const oi=orphans.findIndex(o=>w.seat>=0&&o.userData.code===w.ch&&o.userData.seat===w.seat);
    if(oi>=0){m=orphans.splice(oi,1)[0];VIS.cards.set(k,m);moveCard(m,w);continue;}
    m=makeCard(w.ch);m.userData.seat=w.seat;m.userData.w=w;VIS.cards.set(k,m);bj.add(m);
    if(instant)placeCard(m,w);else{m.visible=false;const real=st.mode==='real';enqueue(()=>animDeal(m,real));}
  }
  orphans.forEach(m=>bj.remove(m));
}
function syncStacks(st,fresh){
  const want=new Map();
  st.seats.forEach((s,si)=>{
    const t=tanOf(seatAng(si));
    if(!s.h.length){if(s.b[0]>0)want.set(`m${si}_0`,{amt:s.b[0],pos:spotPos(si,0)});}
    else{const nH=s.h.length;s.h.forEach((h,hi)=>{if(!h.r)want.set(`m${si}_${hi}`,{amt:h.bet,pos:spotPos(si,0).addScaledVector(t,(hi-(nH-1)/2)*Math.min(.36,handGap(nH)*.6))});});}
    if(!s.sr){if(s.b[1]>0)want.set(`p${si}`,{amt:s.b[1],pos:spotPos(si,1)});if(s.b[2]>0)want.set(`t${si}`,{amt:s.b[2],pos:spotPos(si,2)});}
  });
  for(const [k,stk] of [...VIS.stacks]){
    if(want.has(k))continue;
    VIS.stacks.delete(k);
    if(fresh){bj.remove(stk);continue;}
    const si=+k.slice(1).split('_')[0],seat=st.seats[si];let res=null;
    if(k[0]==='m'){const h=seat.h[+k.split('_')[1]];if(h&&h.r)res=h.r==='bj'?1.5:h.r==='win'?1:h.r==='push'?0:-1;}
    else if(seat.sr){const m=seat.sr[k[0]==='p'?0:1];res=m>0?m:-1;}
    const home=homeOf(si);
    if(res===null)sendHome(bj,stk,home,BJ_SPEED);
    else enqueue(()=>res>0?payout(bj,stk,res,BJ_RACK,home,BJ_SPEED):res===0?sendHome(bj,stk,home,BJ_SPEED):collect(bj,stk,BJ_RACK,BJ_SPEED));
  }
  for(const [k,w] of want){
    const cur=VIS.stacks.get(k);
    if(cur&&cur.userData.amount===w.amt){if(cur.position.distanceTo(w.pos)>.01){const f=cur.position.clone();btween(.4,e=>cur.position.lerpVectors(f,w.pos,e));}continue;}
    const grew=!cur||w.amt>cur.userData.amount;if(cur)bj.remove(cur);
    const s=buildStack(w.amt);s.position.copy(w.pos);bj.add(s);VIS.stacks.set(k,s);
    if(!fresh&&grew){const y0=s.position.y;s.position.y+=.25;btween(.45,e=>s.position.y=y0+.25*(1-e),ease.out);}
  }
}
function clearTable(shuffle){
  const ms=[...VIS.cards.values()];VIS.cards.clear();
  for(const s of VIS.stacks.values())bj.remove(s);VIS.stacks.clear();
  if(ms.length)enqueue(async()=>{
    bMoveArm(ARM_R,releasePoint(ARM_R,W(V3(0,FELT,1.2))),.4).then(()=>bMoveArm(ARM_R,W(V3(-.8,FELT+.1,.2)),.5)).then(()=>brest(ARM_R,.5));
    await Promise.all(ms.map((m,i)=>bwait(i*.05).then(()=>{const f=m.position.clone(),rz=m.rotation.z,ry=m.rotation.y,to=V3(DISCARD.x,FELT+.04+i*.003,DISCARD.z);
      return btween(.5,k=>{m.position.lerpVectors(f,to,k);m.position.y+=Math.sin(Math.PI*k)*.3;m.rotation.z=lerp(rz,Math.PI,k);m.rotation.y=lerp(ry,.2,k);});})));
    await bwait(.1);ms.forEach(m=>bj.remove(m));
  });
  if(shuffle)enqueue(shuffleAnim);
}
async function shuffleAnim(){
  SHUF=true;announce('Mélange du sabot','La carte de coupe est sortie : six jeux mélangés à la main',3000);
  const mk=()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(CW,.09,CH),[edgeMat,edgeMat,backMat,edgeMat,edgeMat,edgeMat]);m.castShadow=true;bj.add(m);return m;};
  const a=mk(),b=mk();a.position.set(DISCARD.x,FELT+.05,DISCARD.z);b.position.copy(a.position);
  const dp=discardPile.scale.y;
  bMoveArm(ARM_R,W(V3(DISCARD.x,FELT+.1,DISCARD.z)),.4);
  await btween(.6,k=>{discardPile.scale.y=lerp(dp,.001,k);discardPile.position.y=FELT+.005+.1*discardPile.scale.y;a.position.lerpVectors(V3(DISCARD.x,FELT+.05,DISCARD.z),V3(-.26,FELT+.05,.2),k);b.position.lerpVectors(V3(DISCARD.x,FELT+.05,DISCARD.z),V3(.26,FELT+.05,.2),k);a.position.y+=Math.sin(Math.PI*k)*.2;});
  for(let r=0;r<4;r++){
    bMoveArm(ARM_R,W(V3(-.26,FELT+.12,.2)),.2);bMoveArm(ARM_L,W(V3(.26,FELT+.12,.2)),.2);
    await btween(.42,k=>{const s=Math.sin(Math.PI*k);a.position.x=-.26+.2*s;b.position.x=.26-.2*s;a.position.y=FELT+.05+.05*s;b.position.y=FELT+.05+.03*s;a.rotation.z=.25*s;b.rotation.z=-.25*s;});
  }
  bMoveArm(ARM_L,W(SHOE_MOUTH),.5);
  await btween(.7,k=>{[a,b].forEach(m=>{m.position.lerp(SHOE_MOUTH,k*.5);m.scale.setScalar(1-k*.8);});shoeDeck.scale.y=lerp(.05,1,k);});
  bj.remove(a,b);brest(ARM_L,.4);brest(ARM_R,.4);SHUF=false;
}
async function burnAnim(){
  const m=makeCard('?');bj.add(m);m.userData.w={pos:V3(DISCARD.x,FELT+.04,DISCARD.z),ry:.2};m.visible=false;
  await animDeal(m,true);await bwait(.2);bj.remove(m);
  announce('Carte brûlée','La première carte du sabot part à la défausse',1800);
}
function updateShoeVis(st){
  if(SHUF)return;let onTable=st.dl.length;st.seats.forEach(s=>s.h.forEach(h=>onTable+=h.c.length));
  const f=st.shoe/312,used=Math.max(0,312-st.shoe-onTable)/312;
  shoeDeck.scale.y=Math.max(.04,f);
  discardPile.scale.y=Math.max(.001,used);discardPile.position.y=FELT+.005+.1*discardPile.scale.y;
}
function events(st,prev,anim){
  if(!anim||!prev)return;
  const mine=i=>st.seats[i].o===MEID;
  if(anim.k==='start'&&anim.ns)announce('Nouveau sabot','6 jeux mélangés',1800);
  if(anim.k==='mode')announce(st.mode==='real'?'Distribution réaliste':'Distribution rapide',st.mode==='real'?'Les cartes glissent du sabot sur le tapis':'Le croupier distribue vite',2800);
  if(anim.k==='burn')enqueue(burnAnim);
  if(anim.k==='side'){
    const msgs=[];let won=0;
    st.seats.forEach((s,i)=>{if(!mine(i)||!s.sr)return;[0,1].forEach(j=>{const m=s.sr[j];if(m<0)return;const n=j?'21+3':'Paires';
      if(m>0){won+=s.b[j+1]*m;msgs.push(`${n} ${SIDE_NAMES[j][m]||''} +${fmt(s.b[j+1]*m)}`);}else msgs.push(`${n} perdu`);});});
    if(msgs.length)enqueue(async()=>announce(won>0?`+${fmt(won)}`:'Side bets perdus',msgs.join('  ·  '),3000));
  }
  if(anim.k==='settle'){
    let net=0;const parts=[];const multi=st.seats.filter((s,i)=>mine(i)&&s.h.length).reduce((a,s)=>a+s.h.length,0)>1;
    st.seats.forEach((s,i)=>{if(!mine(i))return;s.h.forEach((h,hi)=>{const ret=h.r==='bj'?h.bet*2.5:h.r==='win'?h.bet*2:h.r==='push'?h.bet:0;net+=ret-h.bet;
      parts.push(multi?`P${i+1}${s.h.length>1?'.'+(hi+1):''} ${RES_LBL[h.r]}`:RES_LBL[h.r]);});});
    const d=tot(st.dl),dTxt=d>21?'croupier bust':`croupier ${d}`;
    enqueue(async()=>{
      if(parts.length){const big=multi?(net>0?'Gagné':net<0?'Perdu':'Égalité'):parts[0];
        announce(big,(multi?parts.join(' · ')+'  ·  ':'')+(net>0?`+${fmt(net)}`:net<0?`−${fmt(-net)}`:'mise rendue')+'  ·  '+dTxt,3600);}
      else announce(d>21?'Le croupier saute':`Croupier ${d}`,'',1800);
    });
  }
  if(st.phase==='play'&&st.turn&&mine(st.turn[0])&&(!prev.turn||prev.turn[0]!==st.turn[0]||prev.turn[1]!==st.turn[1]||prev.phase!=='play')){
    const many=others().length>0||st.seats.filter((s,i)=>mine(i)&&s.h.length).length>1||st.seats[st.turn[0]].h.length>1;
    if(many)enqueue(async()=>announce('À vous',`Place ${st.turn[0]+1}${st.seats[st.turn[0]].h.length>1?' · main '+(st.turn[1]+1):''}`,1300));
  }
}
function renderState(st,anim){
  const prev=RS;RS=st;const fresh=!prev;
  if(prev&&prev.phase==='betting'&&st.phase!=='betting'){const mine=[];prev.seats.forEach((s,i)=>{if(s.o===MEID)[0,1,2].forEach(k=>{if(s.b[k]>0)mine.push([i,k,s.b[k]]);});});if(mine.length)LAST_BETS=mine;}
  if(prev&&prev.round!==st.round)clearTable(!!(anim&&anim.sh));
  syncCards(st,fresh||qLen>6);
  syncStacks(st,fresh);
  updateShoeVis(st);
  events(st,prev,anim);
  if(!fresh&&st.seats.some((s,i)=>s.by!==prev.seats[i].by))resolveNames();
  refresh();
}
/* ---- E3_bjactions ---- */
/* ---------- actions du joueur ---------- */
function requestBet(s,k){
  if(k!==0||busy.bj)return;
  if(S.phase!=='betting'){status('Les mises sont fermées pour cette donne.');return;}
  const mine=bjSeatOfMine();
  if(mine>=0&&mine!==s){announce('Une main à la fois','Le contrat joue une seule main par joueur : misez sur votre place');return;}
  if(!canAfford(chip))return;
  const seat=S.seats[s];seat.o=MEID;seat.b[0]+=chip;BJ.seat=s;push({k:'bet'});syncBank();
}
function bjClear(){const i=bjSeatOfMine();if(i<0||S.phase!=='betting')return;S.seats[i]=blankSeat();push({k:'clr'});syncBank();}
function bjRebet(){
  if(S.phase!=='betting'||!LAST_BETS||bjSeatOfMine()>=0)return;
  const [s,,v]=LAST_BETS[0];if(!canAfford(v))return;
  S.seats[s].o=MEID;S.seats[s].b[0]=v;BJ.seat=s;push({k:'bet'});syncBank();
}
function myHand(){const st=RS||S;if(st.phase!=='play'||!st.turn)return null;const seat=st.seats[st.turn[0]];if(seat.o!==MEID)return null;return {seat,h:seat.h[st.turn[1]]};}
function canSplit(seat,h){return !!h&&seat.h.length===1&&!h.sp&&h.c.length===2&&cval(dec(h.c[0]))===cval(dec(h.c[1]));}
$('#bjDeal').onclick=bjDeal;
$('#bjClear').onclick=bjClear;
$('#bjRebet').onclick=bjRebet;
$('#bjHit').onclick=()=>bjAct('hit');
$('#bjStand').onclick=()=>bjAct('stand');
$('#bjDouble').onclick=()=>{const x=myHand();if(!x||!canAfford(x.h.bet))return;bjAct('double');};
$('#bjSplit').onclick=()=>{const x=myHand();if(!x||!canAfford(x.h.bet))return;bjAct('split');};
function setMode(m){if(S.phase!=='betting'||S.mode===m)return;S.mode=m;try{localStorage.setItem('riviera-mode',m);}catch(e){}push({k:'mode'});}
$('#modeFast').onclick=()=>setMode('fast');
$('#modeReal').onclick=()=>setMode('real');
/* ---- G1_betat ---- */
/* =========================================================
   ROULETTE — LOGIQUE
   ========================================================= */
const OUT=[{label:'Manque (1-18)',f:n=>n<=18},{label:'Pair',f:n=>n%2===0},{label:'Rouge',f:n=>RED.has(n)},{label:'Noir',f:n=>!RED.has(n)},{label:'Impair',f:n=>n%2===1},{label:'Passe (19-36)',f:n=>n>=19}];
function betAt(ux,uy){
  if(ux<0||ux>=14||uy<0||uy>=5)return null;
  const n=(r,c)=>3*c+3-r;
  if(uy<3){
    if(ux<1)return {key:'n0',nums:[0],label:'Plein 0',px:.58,py:1.5};
    const row=Math.floor(uy);
    if(ux>=13){const m=[0,2,1][row],nums=[];for(let i=1;i<=36;i++)if(i%3===m)nums.push(i);return {key:'col'+row,nums,label:`Colonne ${3-row}`,px:13.5,py:row+.5};}
    const c=Math.floor(ux-1),fx=ux-1-c,fy=uy-row,e=.24;
    let hx=fx<e?-1:fx>1-e?1:0,hy=fy<e?-1:fy>1-e?1:0;
    if(hy===-1&&row===0)hy=0;
    if(hy===1&&row===2){const c2=c+hx;
      if(hx!==0&&c2>=0&&c2<=11){const a=Math.min(c,c2),nums=[1,2,3,4,5,6].map(i=>3*a+i);return {key:'six'+a,nums,label:`Sixain ${nums[0]}-${nums[5]}`,px:2+a,py:3};}
      const nums=[1,2,3].map(i=>3*c+i);return {key:'st'+c,nums,label:`Transversale ${nums[0]}-${nums[2]}`,px:1.5+c,py:3};}
    if(hx===-1&&c===0){
      if(hy!==0){const r2=row+hy,nums=[0,n(row,0),n(r2,0)].sort((a,b)=>a-b);return {key:'tr'+nums.join('-'),nums,label:`Trio ${nums.join('-')}`,px:1,py:Math.max(row,r2)};}
      return {key:'s0-'+n(row,0),nums:[0,n(row,0)],label:`Cheval 0-${n(row,0)}`,px:1,py:row+.5};}
    if(hx===1&&c===11)hx=0;
    if(hx&&hy){const c2=c+hx,r2=row+hy,nums=[n(row,c),n(row,c2),n(r2,c),n(r2,c2)].sort((a,b)=>a-b);return {key:'co'+nums.join('-'),nums,label:`Carré ${nums.join('-')}`,px:1+Math.max(c,c2),py:Math.max(row,r2)};}
    if(hx){const c2=c+hx,nums=[n(row,c),n(row,c2)].sort((a,b)=>a-b);return {key:'s'+nums.join('-'),nums,label:`Cheval ${nums.join('-')}`,px:1+Math.max(c,c2),py:row+.5};}
    if(hy){const r2=row+hy,nums=[n(row,c),n(r2,c)].sort((a,b)=>a-b);return {key:'s'+nums.join('-'),nums,label:`Cheval ${nums.join('-')}`,px:1.5+c,py:Math.max(row,r2)};}
    const x=n(row,c);return {key:'n'+x,nums:[x],label:`Plein ${x}`,px:1.5+c,py:row+.5};
  }
  if(ux<1||ux>=13)return null;
  if(uy<4){const d=Math.floor((ux-1)/4),nums=[];for(let i=1;i<=12;i++)nums.push(12*d+i);return {key:'dz'+d,nums,label:['1re','2e','3e'][d]+' douzaine',px:3+4*d,py:3.5};}
  const k=Math.floor((ux-1)/2),o=OUT[k],nums=[];for(let i=1;i<=36;i++)if(o.f(i))nums.push(i);
  return {key:'o'+k,nums,label:o.label,px:2+2*k,py:4.5};
}
const payOf=b=>36/b.nums.length-1;
/* ---- G2_roulette ---- */
/* ---------- roulette on-chain ----------
   Le contrat accepte : plein, rouge/noir, pair/impair, manque/passe et douzaines.
   Les mises à cheval sur une ligne retombent sur le numéro visé ; les colonnes ne sont pas proposées. */
const CHAIN_BET={o0:[5,0],o1:[3,0],o2:[1,0],o3:[2,0],o4:[4,0],o5:[6,0]};
function chainKey(key){
  if(/^n\d+$/.test(key))return [0,+key.slice(1)];
  if(/^dz[0-2]$/.test(key))return [7,+key.slice(2)];
  return CHAIN_BET[key]||null;
}
function chainBetAt(ux,uy){
  const b=betAt(ux,uy);if(!b)return null;
  if(chainKey(b.key))return b;
  if(uy<3&&ux>=0&&ux<14&&!b.key.startsWith('col')){
    if(ux<1)return betAt(.5,1.5);
    const c=Math.floor(ux-1),row=Math.floor(uy);if(c>=0&&c<12)return betAt(1.5+c,row+.5);
  }
  return null;
}
const RL={state:'betting',bets:new Map(),order:[],last:[],history:[],rotorA:0,rotorV:.3,spin:null,phi:0,r:.565,pre:false,seenRound:-1,skip:0,inited:false};
function onRouletteState(r){
  if(!r)return;
  if(!RL.inited){RL.inited=true;RL.seenRound=r.isOpen?r.roundId-1:r.roundId;if(r.roundId>0&&!r.isOpen&&!RL.history.length){RL.history=[r.lastResult];renderHistory();}return;}
  if(!r.isOpen&&r.roundId>RL.seenRound){RL.seenRound=r.roundId;
    if(RL.skip>0)RL.skip--;else{RL.history.unshift(r.lastResult);renderHistory();if(game==='rl'&&RL.state==='betting')status(`Un autre joueur a lancé : ${r.lastResult}.`);}}
  RL.open=r.isOpen;RL.betsInRound=r.betsInRound;
}
function renderRLStack(b,drop){if(b.stack)rl.remove(b.stack);b.stack=null;if(b.amount<=0){RL.bets.delete(b.key);return;}
  b.stack=buildStack(b.amount);b.stack.scale.setScalar(.92);b.stack.position.copy(layoutLocal(b.px,b.py,FELT+.003));rl.add(b.stack);
  if(drop){const s=b.stack,y0=s.position.y;s.position.y+=.25;tween(.45,e=>s.position.y=y0+.25*(1-e),ease.out);}}
function placeRL(bet){
  if(RL.state!=='betting')return;
  if(!canAfford(chip))return;
  if(!RL.bets.has(bet.key)&&RL.bets.size>=12){announce('Douze mises maximum','Chaque mise est une transaction');return;}
  dolly.visible=false;
  const b=RL.bets.get(bet.key)||{...bet,amount:0,stack:null};b.amount+=chip;RL.bets.set(bet.key,b);RL.order.push({key:bet.key,amt:chip});
  renderRLStack(b,true);syncBank();
}
function rlUndo(){if(RL.state!=='betting'||!RL.order.length)return;const o=RL.order.pop();const b=RL.bets.get(o.key);if(!b)return;b.amount-=o.amt;renderRLStack(b);syncBank();}
function rlClear(){if(RL.state!=='betting')return;RL.bets.forEach(b=>{b.amount=0;renderRLStack(b);});RL.bets.clear();RL.order=[];syncBank();}
function rlRebet(){if(RL.state!=='betting'||!RL.last.length)return;const tot=RL.last.reduce((a,b)=>a+b.amount,0);if(!canAfford(tot))return;
  dolly.visible=false;RL.last.forEach(l=>{const b=RL.bets.get(l.key)||{...l,amount:0,stack:null};b.amount+=l.amount;RL.bets.set(l.key,b);RL.order.push({key:l.key,amt:l.amount});renderRLStack(b,true);});syncBank();}
// Lancer : ouvrir le tour si besoin, envoyer chaque mise, puis faire tourner. La bille tourne
// pendant les transactions et se pose sur le numéro que le contrat a tiré.
async function rlSpin(){
  if(RL.state!=='betting')return;
  if(!RL.bets.size){announce('Faites vos jeux','Posez au moins un jeton sur le tapis',2000);return;}
  if(!needSeat())return;
  const bets=[...RL.bets.values()];const total=bets.reduce((a,b)=>a+b.amount,0);
  RL.state='sending';RL.pre=true;inflight+=total;syncBank();
  RL.last=bets.map(b=>({key:b.key,nums:b.nums,label:b.label,px:b.px,py:b.py,amount:b.amount}));
  if(game==='rl')goView('wheel',1.8);
  announce('Rien ne va plus','Les mises partent sur la chaîne',1800);refresh();
  let placed=0;
  try{
    const st=await api('/api/state');
    if(!st.roulette.isOpen){try{await api('/api/roulette',{action:'open'});}catch(e){if(!/déjà ouvert/.test(e.message))throw e;}}
    for(const b of bets){const [t,v]=chainKey(b.key);status(`Mise ${placed+1}/${bets.length} · ${b.label}…`);
      await api('/api/roulette',{action:'bet',seatId:ME.seat,wager:toMon(b.amount),betType:t,value:v});placed++;}
    status('La bille est lancée…');
    const res=await api('/api/roulette',{action:'spin'});
    RL.skip++;
    const n=Math.max(0,Math.min(36,res.result|0));
    startSpin({idx:WHEEL.indexOf(n),T:5.2+Math.random()*.8,turns:3+rnd(2),seed:Math.random()*6,rv:1.5+Math.random()*.4});
  }catch(e){
    RL.pre=false;inflight=0;
    announce('Lancer interrompu',placed?`${e.message} · ${placed} mise(s) déjà posée(s) restent en jeu au prochain tour`:e.message,4200);
    RL.bets.forEach(b=>{if(b.stack)sendHome(rl,b.stack,V3(b.stack.position.x,FELT+.05,1.75));});RL.bets.clear();RL.order=[];
    RL.state='betting';if(view==='wheel')goView('rl',1.6);afterTx();refresh();
  }
}
function startSpin(sp){
  RL.state='spinning';RL.pre=false;ghost.visible=false;dolly.visible=false;
  const wrap=x=>((x%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  const D=Math.PI*2*sp.turns+wrap(RL.phi-sp.idx*STEP);
  RL.spin={t:0,T:sp.T,D,phiF:RL.phi-D,idx:sp.idx,r0:RL.r,y0:ball.position.y,seed:sp.seed};
  RL.rotorV=sp.rv;
  refresh();
}
async function rlLand(idx){
  const n=WHEEL[idx];RL.state='result';
  await wait(.6);
  RL.history.unshift(n);renderHistory();
  dolly.position.copy(n===0?layoutLocal(.58,1.5,FELT):layoutLocal(1.5+Math.floor((n-1)/3),2-((n-1)%3)+.5,FELT));dolly.visible=true;
  let staked=0,ret=0;const jobs=[];
  RL.bets.forEach(b=>{staked+=b.amount;if(b.nums.includes(n)){const p=payOf(b);ret+=b.amount*(p+1);jobs.push(payout(rl,b.stack,p,RL_RACK,V3(b.stack.position.x,FELT+.05,1.75)));}else jobs.push(collect(rl,b.stack,RL_RACK));});
  const name=n===0?'Zéro':`${n} ${RED.has(n)?'Rouge':'Noir'}`,par=n===0?'':(n%2?' · Impair':' · Pair')+(n<=18?' · Manque':' · Passe');
  announce(name,(staked?(ret>staked?`Gain +${fmt(ret-staked)}`:ret===staked?'Mise rendue':`Perte −${fmt(staked-ret)}`)+'  ·  ':'')+(n===0?'Vert':par.slice(3)),3200);
  RL.bets.clear();RL.order=[];
  await wait(1.4);if(view==='wheel')goView('rl',1.6);
  await Promise.all(jobs);await afterTx();RL.state='betting';if(game==='rl')status('Faites vos jeux.');refresh();
}
function renderHistory(){const h=$('#history');h.innerHTML='';RL.history.slice(0,10).forEach(n=>{const s=document.createElement('span');s.className='hn '+colorOf(n);s.textContent=n;h.appendChild(s);});}
$('#rlSpin').onclick=rlSpin;$('#rlUndo').onclick=rlUndo;$('#rlClear').onclick=rlClear;$('#rlRebet').onclick=rlRebet;

function updateWheel(dt){
  RL.rotorV+=((RL.pre?1.6:.28)-RL.rotorV)*(1-Math.exp(-dt/(RL.spin||RL.pre?2:3)));
  RL.rotorA+=RL.rotorV*dt;rotor.rotation.y=RL.rotorA;
  let r=RL.r,phi=RL.phi,y;const sp=RL.spin;
  if(RL.pre){RL.r=r=lerp(r,.968,1-Math.exp(-dt*5));RL.phi=phi=phi-dt*(7.5+RL.rotorV);y=surfaceY(r)+BR;}
  else if(sp){
    sp.t+=dt;const s=Math.min(1,sp.t/sp.T);
    phi=sp.phiF+sp.D*Math.pow(1-s,2.6);
    if(s<.05){const q=s/.05;r=lerp(sp.r0,.968,ease.out(q));y=lerp(sp.y0,surfaceY(.968)+BR,q);}
    else if(s<.4){r=.968;y=surfaceY(r)+BR;}
    else{const q=(s-.4)/.6,env=Math.pow(1-q,2);
      r=lerp(.968,.565,ease.io(Math.min(1,q/.4)))+.03*Math.sin(q*21)*env*smooth(.35,.5,q);
      y=surfaceY(r)+BR+Math.abs(Math.sin(q*30+sp.seed))*.055*env*smooth(.05,.3,q);
      phi+=.3*Math.sin(q*13+sp.seed)*env*smooth(.25,.45,q);}
    if(s>=1){RL.spin=null;r=.565;phi=sp.phiF;y=surfaceY(r)+BR;rlLand(sp.idx);}
    RL.r=r;RL.phi=phi;
  }else y=surfaceY(r)+BR;
  const a=RL.rotorA+phi;ball.position.set(r*Math.cos(a),y,-r*Math.sin(a));
}
/* ---- H1_refresh ---- */
/* =========================================================
   ÉTAT DES BOUTONS + BADGES
   ========================================================= */
function refresh(){
  const show=(id,on)=>$(id).hidden=!on;const en=(id,on)=>$(id).disabled=!on;
  const st=RS||S,ph=st.phase,betting=ph==='betting';
  const mi=bjSeatOfMine(),myBet=mi>=0?st.seats[mi].b[0]:0;
  show('#bjClear',betting);show('#bjRebet',betting);show('#bjDeal',betting||ph==='deal');
  en('#bjClear',myBet>0&&!busy.bj);en('#bjRebet',!!LAST_BETS&&myBet===0&&!busy.bj);en('#bjDeal',betting&&myBet>=MIN_BET&&!busy.bj);
  $('#bjDeal').textContent=ph==='deal'?'Transaction…':'Distribuer';
  const x=myHand(),h=x&&x.h;
  ['#bjHit','#bjStand','#bjDouble','#bjSplit'].forEach(id=>show(id,!!x));
  const canAct=!!h&&!h.d&&h.c.length>=2&&!busy.bj;
  en('#bjHit',canAct);en('#bjStand',canAct);en('#bjDouble',canAct&&h.c.length===2&&!h.dbl&&bank>=h.bet);
  en('#bjSplit',canAct&&canSplit(x.seat,h)&&bank>=h.bet);
  $('#modeFast').setAttribute('aria-pressed',st.mode==='fast');$('#modeReal').setAttribute('aria-pressed',st.mode==='real');
  en('#modeFast',betting);en('#modeReal',betting);
  $('#bjTally').innerHTML=betting||ph==='deal'?`Mise <b>${fmt(myBet)}</b>`:mi>=0?`En jeu <b>${fmt(st.seats[mi].h.reduce((b,hh)=>b+hh.bet,0))}</b>`:'';
  let rt=0;RL.bets.forEach(b=>rt+=b.amount);
  $('#rlTally').innerHTML=`Mises <b>${fmt(rt)}</b>`;
  const rb=RL.state==='betting';
  en('#rlUndo',rb&&RL.order.length>0);en('#rlClear',rb&&rt>0);en('#rlRebet',rb&&rt===0&&RL.last.length>0);en('#rlSpin',rb&&rt>0);
  $('#rlSpin').textContent=RL.state==='sending'?'Transactions…':'Lancer la bille';
  en('#cfFace',CF.state==='idle');en('#cfPile',CF.state==='idle');
  $('#tableInfo').textContent=game==='bj'?'Une main par joueur · tout se joue sur le contrat':game==='rl'&&RL.open?`Tour ouvert sur la chaîne · ${RL.betsInRound||0} mise(s)`:'Glisser pour tourner · molette pour zoomer';
  if(!ME.seat&&entered){status('Asseyez-vous pour jouer : choisissez un pseudo.');return;}
  if(game==='bj'){
    if(betting)status(myBet>0?'Distribuez quand vous êtes prêt : la donne part en transaction.':'Choisissez un jeton puis cliquez sur MISE d\'une place. Le contrat joue une main par joueur.');
    else if(ph==='deal')status('Le contrat distribue…');
    else if(ph==='play'&&st.turn){const seat=st.seats[st.turn[0]];
      if(busy.bj)status('Transaction en cours…');
      else if(x)status(`À vous${seat.h.length>1?', main '+(st.turn[1]+1):''} : tirer, rester, doubler ou séparer.`);}
    else if(ph==='dealer')status('Le croupier joue…');
    else if(ph==='done')status('Paiement des gains…');
  }else if(game==='crash'){
    status(CR.state==='fly'?(CR.bet&&!CR.cashed?'Encaissez avant que l\'avion ne s\'envole ! (Espace)':CR.cashed?'Encaissé : le gain est réglé à l\'envol.':'Vol en cours. Misez au prochain.'):
      CR.state==='wait'?(CR.bet?`À bord avec ${fmt(CR.bet)}. Décollage imminent.`:'Mises ouvertes : montez à bord avant le décollage.'):
      'Réglez votre mise avec + / − et le jeton choisi : miser ouvre un nouveau vol.');
  }else if(game==='coin'){
    if(CF.state==='idle')status('Réglez la mise, puis choisissez Face ou Pile (ou cliquez sur le tapis).');
  }else if(RL.state==='betting'&&!hoverBet)status(rt>0?'Lancez la bille quand vous voulez.':'Faites vos jeux : pleins, douzaines et chances simples.');
}
/* ---- H2_tail ---- */
function mkBadge(cls=''){const e=document.createElement('div');e.className='badge '+cls;e.style.opacity=0;document.body.appendChild(e);return e;}
const badges={d:mkBadge(),hands:Array.from({length:NSEAT*5},()=>mkBadge()),seats:Array.from({length:NSEAT},()=>mkBadge('seat'))};
function place(el,local,text,cls,base='badge'){
  if(!text||game!=='bj'||view!=='bj'){el.style.opacity=0;return;}
  tmpV.copy(local);bj.localToWorld(tmpV);tmpV.project(camera);
  const x=(tmpV.x+1)/2*innerWidth,y=(1-tmpV.y)/2*innerHeight;
  if(el.textContent!==text)el.textContent=text;const c=base+(cls?' '+cls:'');if(el.className!==c)el.className=c;el.style.opacity=1;el.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;
}
function visibleCards(prefix){let s='';for(let i=0;i<12;i++){const m=VIS.cards.get(prefix+i);if(!m)break;if(m.visible&&m.userData.code!=='?')s+=m.userData.code;}return s;}
function updateBadges(){
  const st=RS||S;
  const dv=visibleCards('d');
  place(badges.d,V3(-.3+Math.max(st.dl.length,1)*.26+.06,FELT+.05,.32),dv?htxt(dv,dv.length===2&&st.dl.length===2&&tot(dv)===21):'');
  let turnShown=false;
  st.seats.forEach((s,si)=>{
    const a=seatAng(si);
    for(let hi=0;hi<5;hi++){const el=badges.hands[si*5+hi],h=s.h[hi];
      if(!h){place(el,V3(),'');continue;}
      const vis=visibleCards(`c${si}_${hi}_`);if(!vis){place(el,V3(),'');continue;}
      const active=st.phase==='play'&&st.turn&&st.turn[0]===si&&st.turn[1]===hi;
      const cls=h.r?(h.r==='win'||h.r==='bj'?'win':h.r==='push'?'':'lose'):active?'active':'';
      const p=handCardPos(si,hi,s.h.length,0).addScaledVector(V3(Math.sin(a),0,Math.cos(a)),.36);
      place(el,p,htxt(vis,natural(h)&&vis.length===2),cls);
      if(active){turnShown=true;const q=handCardPos(si,hi,s.h.length,Math.max(0,h.c.length-1)*.5);turnRing.position.set(q.x,FELT+.004,q.z);turnRing.rotation.z=-a;turnRing.material.color.set(s.o===MEID?0xffd98c:0x9ec5ff);}
    }
    const ring=seatRings[si];ring.visible=!!s.o;if(s.o)ring.material.color.set(s.o===MEID?0xffd98c:0x8fb8ff);
    place(badges.seats[si],polar(3.08,a,FELT+.05),s.o?nameOf(s):'',s.o===MEID?'mine':'','badge seat');
  });
  turnRing.visible=turnShown;
}

/* =========================================================
   POINTEUR
   ========================================================= */
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();let drag=null,hoverBet=null;
function pick(e){ndc.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(ndc,camera);}
function spotAllowed(s,k){const st=RS||S;if(k!==0||st.phase!=='betting'||busy.bj)return false;const mine=bjSeatOfMine();return mine<0||mine===s;}
function hover(e){
  if(!document.body.classList.contains('in'))return;
  pick(e);let hot=false;
  if(game==='bj'&&view==='bj'){const hit=ray.intersectObjects(spotHits)[0];const sp=hit&&hit.object.userData.spot;const ok=sp&&spotAllowed(sp.s,sp.k);
    spotRing.visible=!!ok;
    if(ok){hot=true;const p=spotPos(sp.s,sp.k);spotRing.position.set(p.x,FELT+.005,p.z);spotRing.scale.setScalar(SPOT_R[sp.k]);status(`Place ${sp.s+1} · mise principale · jeton de ${chip}`);}
    else if(sp&&(RS||S).phase==='betting'&&bjSeatOfMine()>=0)status('Une main par joueur : misez sur votre place.');
    else refresh();}
  if(game==='rl'&&view==='rl'){const hit=ray.intersectObject(layoutPlane)[0];hoverBet=hit&&RL.state==='betting'?chainBetAt(hit.uv.x*14,(1-hit.uv.y)*5):null;
    ghost.visible=!!hoverBet;if(hoverBet){hot=true;const p=layoutLocal(hoverBet.px,hoverBet.py,FELT+.02);const b=RL.bets.get(hoverBet.key);ghost.position.set(p.x,p.y+(b?Math.min(20,breakdown(b.amount).length)*CHIP_H*.92:0),p.z);
      status(`${hoverBet.label} · paie ${payOf(hoverBet)} pour 1`);}else refresh();}
  if(game==='coin'&&view==='coin'){const hit=ray.intersectObjects(cfHits)[0];const k=hit?hit.object.userData.cf:null;const ok=k!=null&&CF.state==='idle';cfRing.visible=ok;
    if(ok){hot=true;const p=CF_SPOT[k];cfRing.position.set(p.x,FELT+.005,p.z);status(`${faceName(k)} · ${fmt(CF.stake)} · paie 1 pour 1`);}else if(!hit)refresh();}
  stage.classList.toggle('hot',hot);
}
function click(e){
  pick(e);
  if(game==='bj'&&view==='bj'){const hit=ray.intersectObjects(spotHits)[0];if(hit){const sp=hit.object.userData.spot;requestBet(sp.s,sp.k);}}
  else if(game==='rl'&&view==='rl'){const hit=ray.intersectObject(layoutPlane)[0];if(hit){const b=chainBetAt(hit.uv.x*14,(1-hit.uv.y)*5);if(b)placeRL(b);hover(e);}}
  else if(game==='coin'&&view==='coin'){const hit=ray.intersectObjects(cfHits)[0];if(hit)cfFlip(hit.object.userData.cf);}
}
stage.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false};stage.setPointerCapture(e.pointerId);});
stage.addEventListener('pointermove',e=>{
  if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>6){drag.moved=true;stage.classList.add('drag');}
    if(drag.moved&&view!=='intro'){user.yaw=clamp(user.yaw-dx*.005,-1.4,1.4);user.pitch=clamp(user.pitch+dy*.004,-.6,.6);}drag.x=e.clientX;drag.y=e.clientY;}
  else hover(e);
});
stage.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&document.body.classList.contains('in'))click(e);drag=null;stage.classList.remove('drag');});
stage.addEventListener('pointercancel',()=>{drag=null;stage.classList.remove('drag');});
// deux doigts : pincer pour zoomer
const touches=new Map();let pinch=null;
stage.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===2){const [a,b]=[...touches.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:user.zoom};drag=null;}}});
stage.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&touches.size===2){const [a,b]=[...touches.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);user.zoom=clamp(pinch.z*pinch.d/Math.max(20,d),.45,1.6);drag=null;}});
const endTouch=e=>{touches.delete(e.pointerId);if(touches.size<2)pinch=null;};
stage.addEventListener('pointerup',endTouch);stage.addEventListener('pointercancel',endTouch);
stage.addEventListener('wheel',e=>{e.preventDefault();user.zoom=clamp(user.zoom*Math.exp(e.deltaY*.0012),.45,1.6);},{passive:false});
stage.addEventListener('contextmenu',e=>e.preventDefault());

/* =========================================================
   INTRO — maintenir pour entrer
   ========================================================= */
let ready=false,holdP=0,holding=false,entered=false;
const hold=$('#hold'),ring=$('#holdRing');
const startHold=e=>{if(!ready||entered)return;e.preventDefault();holding=true;hold.classList.add('on');};
const stopHold=()=>{holding=false;hold.classList.remove('on');};
hold.addEventListener('pointerdown',startHold);addEventListener('pointerup',stopHold);hold.addEventListener('pointerleave',stopHold);
hold.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter')startHold(e);});hold.addEventListener('keyup',stopHold);
function updateHold(dt){
  if(entered)return;holdP=clamp(holdP+(holding?dt/(reduced?.3:1.1):-dt*1.8),0,1);ring.style.strokeDashoffset=339.3*(1-holdP);
  if(holdP>=1)enter();
}
function enter(){
  entered=true;$('#intro').classList.add('gone');document.body.classList.add('in');
  setTimeout(resize,50);setTimeout(resize,1300);
  setGame(START_GAME);camSpeed=1.25;setTimeout(()=>{camSpeed=2.6;},2200);
  if(!ME.seat)setTimeout(askNickname,900);
  else setTimeout(()=>announce(ME.nick?`Bonsoir, ${ME.nick}`:'Bonsoir','Chaque mise est une transaction sur Monad testnet',2600),700);
  refresh();movePill();
}

/* =========================================================
   BOUCLE
   ========================================================= */
let last=performance.now(),clock=0,pollT=3;
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;
  stepTweens(dt);updateArms(dt,clock);updateWheel(dt);updateCrash(dt,clock);updateCoin(dt,clock);updateCamera(dt,clock);updateHold(dt);
  if((pollT-=dt)<=0){pollT=3;pollState();}
  if(dust){dust.rotation.y=Math.sin(clock*.05)*.04;dust.position.y=Math.sin(clock*.3)*.05;}
  if(spotRing.visible)spotRing.material.opacity=.55+.3*Math.sin(clock*5);
  if(turnRing.visible)turnRing.material.opacity=.45+.35*Math.sin(clock*4);
  if(ghost.visible)ghost.material.opacity=.3+.15*Math.sin(clock*5);
  updateBadges();
  renderer.render(scene,camera);requestAnimationFrame(frame);
}

async function boot(){
  try{await Promise.race([Promise.all([document.fonts.load('64px Limelight'),document.fonts.load('800 48px Figtree'),document.fonts.load('600 32px Figtree')]),new Promise(r=>setTimeout(r,2500))]);}catch(e){}
  build();resize();setBank(bank);renderState(clone(S),null);renderCfHist();toGround();
  await pollState();bjRestore();pollAviator();
  requestAnimationFrame(t=>{last=t;frame(t);});
  ready=true;$('#loadmsg').textContent='Maintenez le bouton pour entrer';
}
boot();

/* ---------- crochets de diagnostic (console, tests) : mêmes actions que les clics ---------- */
window.Riviera={
  bet:(s=2)=>requestBet(s,0),
  rouletteAt:(ux,uy)=>{const b=chainBetAt(ux,uy);if(b)placeRL(b);return b&&b.label;},
  state:()=>({phase:S.phase,seats:S.seats.map(s=>({o:s.o,b:s.b[0],h:s.h.map(h=>({c:h.c,bet:h.bet,r:h.r,d:h.d}))})),dl:S.dl,bank,chainBank,inflight,
    rl:{state:RL.state,bets:[...RL.bets.values()].map(b=>[b.key,b.amount]),hist:RL.history.slice(0,5)},cr:{state:CR.state,phase:CR.phase,bet:CR.bet,m:CR.m,cashed:CR.cashed,hist:CR.history.slice(0,5)},cf:{state:CF.state,hist:CF.hist.slice(0,5)},game,view,seat:ME.seat,qLen}),
};
})();
})(0);
