const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const KEY='sinaps_v1_state';
const state=JSON.parse(localStorage.getItem(KEY)||'null') || {
  points:0, energy:1000, maxEnergy:1000, level:1, lastEnergy:Date.now(), daily:null
};
const $=id=>document.getElementById(id);

function save(){localStorage.setItem(KEY,JSON.stringify(state));}
function regen(){
  const now=Date.now(), elapsed=Math.floor((now-state.lastEnergy)/3000);
  if(elapsed>0){state.energy=Math.min(state.maxEnergy,state.energy+elapsed);state.lastEnergy=now;save();}
}
function render(){
  regen();
  $('points').textContent=state.points.toLocaleString();
  state.level=Math.floor(state.points/1000)+1;
  $('level').textContent=state.level;
  $('energyText').textContent=state.energy;
  $('energyFill').style.width=(state.energy/state.maxEnergy*100)+'%';
}
function addPoints(n){
  state.points+=n; save(); render();
}
$('tap').addEventListener('pointerdown',e=>{
  if(state.energy<=0)return;
  state.energy--; addPoints(1);
  const f=document.createElement('div'); f.className='floater'; f.textContent='+1';
  f.style.left=(e.offsetX-5)+'px'; f.style.top=(e.offsetY-10)+'px';
  $('floaters').appendChild(f); setTimeout(()=>f.remove(),750);
});
$('daily').onclick=()=>{
  const today=new Date().toISOString().slice(0,10);
  if(state.daily===today){alert('Daily bonus already claimed.');return}
  state.daily=today; addPoints(100); alert('+100 points claimed!');
};
$('invite').onclick=()=>{
  const id=tg?.initDataUnsafe?.user?.id || 'demo';
  const link=location.origin+location.pathname+'?ref='+id;
  navigator.clipboard?.writeText(link);
  alert('Referral link copied (demo):\n'+link);
};
$('tasks').onclick=()=>alert('Tasks module is reserved for v1.1.');
$('leaderboard').onclick=()=>alert('Leaderboard backend is reserved for v1.1.');
$('walletBtn').onclick=()=>alert('TON Connect is planned for the next build. Never enter a seed phrase into SINAPS.');
$('reset').onclick=()=>{if(confirm('Reset demo data?')){localStorage.removeItem(KEY);location.reload()}};

if(tg?.initDataUnsafe?.user){
  const u=tg.initDataUnsafe.user;
  $('status').textContent='Welcome '+(u.first_name||u.username||'SINAPS user');
}
setInterval(render,1000); render();
