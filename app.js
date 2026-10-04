(function(){
'use strict';

const API='https://sinaps-backend.onrender.com';
const MANIFEST='https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json';
const TREASURY='UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX';
const FEE='100000000';
const MAINNET='-239';

let tg=null,user=null,initData='',tonUI=null;
let balance=0,energy=1000,maxEnergy=1000;
let queue=0,pending=0,processing=false,energyTimer=null,withdrawing=false;

const $=id=>document.getElementById(id);

function notify(msg,ok=false){
  let x=$('sinapsToast');
  if(!x){
    x=document.createElement('div');
    x.id='sinapsToast';
    document.body.appendChild(x);
  }
  x.textContent=msg;
  x.className=ok?'ok':'';
  x.style.display='block';
  clearTimeout(x._t);
  x._t=setTimeout(()=>x.style.display='none',2800);
}

function esc(s){
  return String(s??'').replace(/[&<>'"]/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  }[c]));
}

async function api(path,options={}){
  options.headers=Object.assign({
    'Content-Type':'application/json',
    'X-Telegram-Init-Data':initData
  },options.headers||{});

  if(options.body&&typeof options.body==='string'){
    try{
      const b=JSON.parse(options.body);
      b.init_data=initData;
      options.body=JSON.stringify(b);
    }catch{}
  }

  const r=await fetch(API+path,options);
  let d={};
  try{d=await r.json()}catch{}

  if(!r.ok)throw new Error(d.error||d.message||('HTTP '+r.status));
  return d;
}

function render(){
  if($('balance'))
    $('balance').textContent=Math.max(0,Math.floor(balance)).toLocaleString();

  if($('energy'))
    $('energy').textContent=Math.max(0,Math.floor(energy))+' / '+Math.floor(maxEnergy);

  if($('energyFill'))
    $('energyFill').style.width=
      Math.max(0,Math.min(100,energy/maxEnergy*100))+'%';

  if($('withdrawBalance'))
    $('withdrawBalance').textContent=
      Math.floor(balance).toLocaleString()+' SNP';
}

function save(){
  try{
    localStorage.setItem('sinaps_v7',
      JSON.stringify({balance,energy,maxEnergy})
    );
  }catch{}
}

function load(){
  try{
    const x=JSON.parse(
      localStorage.getItem('sinaps_v7')||'{}'
    );

    if(Number.isFinite(+x.balance))balance=+x.balance;
    if(Number.isFinite(+x.energy))energy=+x.energy;
    if(Number.isFinite(+x.maxEnergy))maxEnergy=+x.maxEnergy;
  }catch{}
}

function telegram(){
  if(!window.Telegram?.WebApp)return;

  tg=window.Telegram.WebApp;
  tg.ready();

  try{tg.expand()}catch{}

  user=tg.initDataUnsafe?.user||null;
  initData=tg.initData||'';

  if(user){
    if($('username'))
      $('username').textContent=
        user.username?'@'+user.username:
        (user.first_name||'SINAPS User');

    if($('avatarLetter'))
      $('avatarLetter').textContent=
        (user.first_name||user.username||'S')
        .charAt(0).toUpperCase();

    if(user.photo_url&&$('userAvatar')){
      $('userAvatar').src=user.photo_url;
      $('userAvatar').style.display='block';

      if($('avatarLetter'))
        $('avatarLetter').style.display='none';
    }
  }
}

async function loadUser(){
  if(!user?.id)return;

  try{
    const d=await api('/api/user',{
      method:'POST',
      body:JSON.stringify({
        telegram_id:user.id,
        username:user.username||user.first_name||'',
        start_param:tg?.initDataUnsafe?.start_param||''
      })
    });

    const u=d.user||{};

    if(!pending){
      balance=+u.balance||0;
      energy=+u.energy||0;
      maxEnergy=+u.max_energy||1000;

      render();
      save();
    }
  }catch(e){
    notify(e.message);
  }
}

async function sendTap(){
  return api('/api/tap',{
    method:'POST',
    body:JSON.stringify({
      telegram_id:user.id
    })
  });
}

async function processTaps(){
  if(processing||!queue)return;

  processing=true;

  while(queue){
    try{
      const d=await sendTap();

      queue--;
      pending--;

      if(!pending&&!queue){
        const u=d.user||{};

        balance=+u.balance||balance;
        energy=+u.energy||energy;
        maxEnergy=+u.max_energy||maxEnergy;

        render();
        save();
      }
    }catch(e){
      console.log(e);
      break;
    }
  }

  processing=false;

  if(queue)
    setTimeout(processTaps,500);
}

function tap(){
  const a=$('tapArea');
  if(!a)return;

  a.addEventListener('pointerdown',e=>{
    e.preventDefault();

    if(!user?.id||energy<=0)return;

    balance++;
    energy--;

    queue++;
    pending++;

    render();
    save();

    const r=a.getBoundingClientRect();

    const f=document.createElement('div');
    f.className='floater';
    f.textContent='+1';
    f.style.left=(e.clientX-r.left)+'px';
    f.style.top=(e.clientY-r.top)+'px';

    $('floaters')?.appendChild(f);

    setTimeout(()=>f.remove(),700);

    $('sCoin')?.classList.add('hit');

    setTimeout(
      ()=>$('sCoin')?.classList.remove('hit'),
      120
    );

    processTaps();

  },{passive:false});
}

function startEnergy(){
  clearInterval(energyTimer);

  energyTimer=setInterval(()=>{
    if(energy<maxEnergy){
      energy++;
      render();
      save();
    }
  },3000);
}

/* =========================================================
   TASKS
========================================================= */

async function loadTasks(){
  try{
    const d=await api(
      '/api/tasks?telegram_id='+encodeURIComponent(user.id)
    );

    const tasks=d.tasks||[];

    let box=$('tasksList');

    if(!box)return;

    box.innerHTML=tasks.map(t=>`
      <div class="task-card">
        <div class="task-icon">${esc(t.icon||'✓')}</div>
        <div class="task-info">
          <b>${esc(t.title)}</b>
          <span>+${Number(t.reward).toLocaleString()} SNP</span>
        </div>

        ${
          t.completed
          ? `<button class="task-btn done">✓ Done</button>`
          : `<button class="task-btn"
              onclick="window.sinapsClaimTask('${esc(t.id)}')">
              ${t.action||'Verify'}
            </button>`
        }
      </div>
    `).join('');

  }catch(e){
    console.log(e);
  }
}

window.sinapsClaimTask=async function(taskId){

  try{
    const d=await api('/api/tasks/claim',{
      method:'POST',
      body:JSON.stringify({
        telegram_id:user.id,
        task_id:taskId
      })
    });

    if(d.ok){
      balance=Number(d.balance??balance);
      render();
      save();

      notify(
        `+${Number(d.reward).toLocaleString()} SNP received`,
        true
      );

      loadTasks();
      loadHistory();
    }

  }catch(e){
    notify(e.message||'Please try again');
  }
};

/* =========================================================
   DAILY
========================================================= */

async function loadDaily(){
  try{
    const d=await api(
      '/api/daily/status?telegram_id='+encodeURIComponent(user.id)
    );

    renderDaily(d);

  }catch(e){
    console.log(e);
  }
}

function renderDaily(d){
  let box=$('dailyModal');

  if(!box){
    box=document.createElement('div');
    box.id='dailyModal';
    box.className='sinaps-modal';
    document.body.appendChild(box);
  }

  const day=Number(d.current_day||1);
  const claimed=Boolean(d.claimed);

  box.innerHTML=`
    <div class="modal-card daily-card">
      <button class="modal-close"
        onclick="document.getElementById('dailyModal').remove()">×</button>

      <h2>🎁 Daily Rewards</h2>
      <p>Keep your streak and collect SNP every day.</p>

      <div class="daily-grid">
        ${Array.from({length:30},(_,i)=>{
          const n=i+1;
          const reward=n*10;

          let cls='';

          if(n<day)cls='past';
          if(n===day)cls='today';
          if(n>day)cls='locked';

          return `
            <button class="daily-day ${cls}"
              ${n===day&&!claimed?'onclick="window.sinapsClaimDaily()"':''}>
              <strong>Day ${n}</strong>
              <span>${reward} SNP</span>
              ${n<day||n===day&&claimed?'<em>✓</em>':''}
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

window.sinapsOpenDaily=async function(){
  await loadDaily();

  const m=$('dailyModal');

  if(m)m.style.display='flex';
};

window.sinapsClaimDaily=async function(){
  try{
    const d=await api('/api/daily/claim',{
      method:'POST',
      body:JSON.stringify({
        telegram_id:user.id
      })
    });

    balance=Number(d.balance??balance);

    render();
    save();

    notify(
      `+${Number(d.reward).toLocaleString()} SNP`,
      true
    );

    loadDaily();
    loadHistory();

  }catch(e){
    notify(e.message);
  }
};

/* =========================================================
   FRIENDS
========================================================= */

async function loadFriends(){
  try{
    const d=await api(
      '/api/friends?telegram_id='+encodeURIComponent(user.id)
    );

    const code=$('inviteCode');

    if(code)
      code.textContent=d.referral_code||'';

    if($('friendsCount'))
      $('friendsCount').textContent=
        Number(d.count||0).toLocaleString();

    const list=$('friendsList');

    if(list){
      list.innerHTML=(d.friends||[]).map(f=>`
        <div class="friend-row">
          <span>${esc(f.username||'User')}</span>
          <strong>${Number(f.balance||0).toLocaleString()} SNP</strong>
        </div>
      `).join('')||'<div class="empty">No friends yet</div>';
    }

  }catch(e){
    console.log(e);
  }
}

window.sinapsCopyInvite=async function(){

  const code=$('inviteCode')?.textContent||'';

  if(!code)return;

  const link=
    'https://t.me/SNPCOINBot?start='+encodeURIComponent(code);

  try{
    await navigator.clipboard.writeText(link);
    notify('Invite link copied',true);
  }catch{
    notify(link);
  }
};

/* =========================================================
   HISTORY
========================================================= */

async function loadHistory(){
  try{
    const d=await api(
      '/api/history?telegram_id='+encodeURIComponent(user.id)
    );

    const box=$('historyList');

    if(!box)return;

    box.innerHTML=(d.transactions||[]).map(x=>`
      <div class="history-row">
        <div>
          <b>${esc(x.type||'Transaction')}</b>
          <small>${esc(x.created_at||'')}</small>
        </div>

        <strong class="${Number(x.amount)>=0?'plus':'minus'}">
          ${Number(x.amount)>=0?'+':''}${Number(x.amount).toLocaleString()} SNP
        </strong>

        <span class="status">
          ${esc(x.status||'Completed')}
        </span>
      </div>
    `).join('')||'<div class="empty">No transactions yet</div>';

  }catch(e){
    console.log(e);
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation(){

  document.addEventListener('click',e=>{

    const nav=e.target.closest('[data-page]');

    if(!nav)return;

    const page=nav.dataset.page;

    document.querySelectorAll('[data-page]')
      .forEach(x=>x.classList.remove('active'));

    nav.classList.add('active');

    document.querySelectorAll('.page')
      .forEach(x=>x.style.display='none');

    const target=$('page-'+page);

    if(target)
      target.style.display='block';

    if(page==='tasks')
      loadTasks();

    if(page==='friends')
      loadFriends();

    if(page==='wallet')
      loadHistory();

    if(page==='home')
      render();
  });
}

/* =========================================================
   WALLET
========================================================= */

async function connectWallet(){

  try{

    if(!window.TON_CONNECT_UI){

      notify('TON Connect is loading...');
      return;
    }

    tonUI=new TON_CONNECT_UI.TonConnectUI({
      manifestUrl:MANIFEST,
      buttonRootId:'ton-connect'
    });

    tonUI.onStatusChange(async wallet=>{

      if(!wallet)return;

      const address=wallet.account.address;

      try{
        await api('/api/wallet/connect',{
          method:'POST',
          body:JSON.stringify({
            telegram_id:user.id,
            wallet_address:address
          })
        });

        if($('walletAddress'))
          $('walletAddress').textContent=
            address.slice(0,6)+'...'+address.slice(-6);

        notify('Wallet connected',true);

      }catch(e){
        notify(e.message);
      }

    });

  }catch(e){
    notify(e.message);
  }
}

/* =========================================================
   WITHDRAW
========================================================= */

window.sinapsWithdraw=async function(){

  if(withdrawing)return;

  const input=$('withdrawAmount');

  const amount=Number(input?.value||0);

  if(!amount||amount<=0){
    notify('Enter SNP amount');
    return;
  }

  if(amount>balance){
    notify('Insufficient SNP balance');
    return;
  }

  withdrawing=true;

  try{

    const wallet=$('walletAddress')?.dataset?.address||'';

    if(!wallet){
      notify('Connect wallet first');
      withdrawing=false;
      return;
    }

    const d=await api('/api/withdraw/create',{
      method:'POST',
      body:JSON.stringify({
        telegram_id:user.id,
        wallet_address:wallet,
        amount
      })
    });

    if(!tonUI){
      notify('Connect TON wallet first');
      withdrawing=false;
      return;
    }

    const tx={
      validUntil:Math.floor(Date.now()/1000)+600,
      messages:[{
        address:TREASURY,
        amount:FEE
      }]
    };

    await tonUI.sendTransaction(tx);

    await api('/api/withdraw/verify',{
      method:'POST',
      body:JSON.stringify({
        telegram_id:user.id,
        withdrawal_id:d.withdrawal_id,
        wallet_address:wallet
      })
    });

    notify('Payment submitted. Withdrawal is being reviewed.',true);

    loadHistory();

  }catch(e){

    notify(e.message);

  }finally{
    withdrawing=false;
  }
};

/* =========================================================
   GAME DEMO
========================================================= */

window.sinapsCrashDemo=function(){

  const result=$('gameResult');

  if(!result)return;

  result.textContent='🚀 Launching...';

  let x=1;

  const timer=setInterval(()=>{

    x+=Math.random()*0.15;

    result.textContent=
      '🚀 '+x.toFixed(2)+'x';

    if(Math.random()<0.025){

      clearInterval(timer);

      result.textContent=
        '💥 CRASHED at '+x.toFixed(2)+'x';

    }

  },120);
};

window.sinapsPlinkoDemo=function(){

  const result=$('gameResult');

  if(!result)return;

  const values=[
    '0.2x',
    '0.5x',
    '1x',
    '2x',
    '5x',
    '10x'
  ];

  result.textContent=
    '🎯 '+values[Math.floor(Math.random()*values.length)];

};

/* =========================================================
   INIT
========================================================= */

function init(){

  load();
  telegram();

  setupNavigation();
  tap();
  startEnergy();

  loadUser();

  setTimeout(()=>{
    loadTasks();
    loadDaily();
    loadFriends();
    loadHistory();
  },1200);

  const gift=$('dailyGift');

  if(gift)
    gift.addEventListener('click',window.sinapsOpenDaily);

  connectWallet();

  render();
}

if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',init);
else
  init();

})();
