(function(){
'use strict';

/* =========================================================
   SINAPS — APP.JS
========================================================= */

const API = 'https://sinaps-backend.onrender.com';

const MANIFEST =
  'https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json';

const TREASURY =
  'UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX';

const FEE = '100000000';
const MAINNET = '-239';

const TAP_POWER = 2;
const ENERGY_REGEN_MS = 3000;

let tg = null;
let user = null;
let initData = '';

let tonUI = null;

let balance = 0;
let energy = 1000;
let maxEnergy = 1000;

let queue = 0;
let pending = 0;
let processing = false;

let energyTimer = null;
let withdrawing = false;
let walletAddress = '';

/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function notify(msg, ok = false){

  let x = $('sinapsToast');

  if(!x){
    x = document.createElement('div');
    x.id = 'sinapsToast';
    document.body.appendChild(x);
  }

  x.textContent = msg;
  x.className = ok ? 'ok' : '';
  x.style.display = 'block';

  clearTimeout(x._t);

  x._t = setTimeout(() => {
    x.style.display = 'none';
  }, 2800);
}

function esc(s){

  return String(s ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  }[c]));

}

function shortAddress(address){

  if(!address)return 'Not connected';

  if(address.length <= 14)return address;

  return address.slice(0,6) + '...' + address.slice(-6);
}

/* =========================================================
   API
========================================================= */

async function api(path, options = {}){

  options.headers = Object.assign({
    'Content-Type':'application/json',
    'X-Telegram-Init-Data':initData
  }, options.headers || {});

  if(options.body && typeof options.body === 'string'){

    try{

      const b = JSON.parse(options.body);

      b.init_data = initData;

      options.body = JSON.stringify(b);

    }catch{}

  }

  const response = await fetch(API + path, options);

  let data = {};

  try{
    data = await response.json();
  }catch{}

  if(!response.ok){

    throw new Error(
      data.error ||
      data.message ||
      ('HTTP ' + response.status)
    );

  }

  return data;
}

/* =========================================================
   RENDER
========================================================= */

function render(){

  if($('balance')){

    $('balance').textContent =
      Math.max(0, Math.floor(balance))
      .toLocaleString();

  }

  if($('energy')){

    $('energy').textContent =
      Math.max(0, Math.floor(energy)) +
      ' / ' +
      Math.floor(maxEnergy);

  }

  if($('energyFill')){

    const percent =
      maxEnergy > 0
      ? Math.max(
          0,
          Math.min(100, energy / maxEnergy * 100)
        )
      : 0;

    $('energyFill').style.width =
      percent + '%';

  }

  if($('withdrawBalance')){

    $('withdrawBalance').textContent =
      Math.max(0, Math.floor(balance))
      .toLocaleString() +
      ' SNP';

  }

  renderWallet();

}

/* =========================================================
   LOCAL STORAGE
========================================================= */

function save(){

  try{

    localStorage.setItem(
      'sinaps_v8',
      JSON.stringify({
        balance,
        energy,
        maxEnergy,
        walletAddress
      })
    );

  }catch{}

}

function load(){

  try{

    const data = JSON.parse(
      localStorage.getItem('sinaps_v8') || '{}'
    );

    if(Number.isFinite(Number(data.balance)))
      balance = Number(data.balance);

    if(Number.isFinite(Number(data.energy)))
      energy = Number(data.energy);

    if(Number.isFinite(Number(data.maxEnergy)))
      maxEnergy = Number(data.maxEnergy);

    if(typeof data.walletAddress === 'string')
      walletAddress = data.walletAddress;

  }catch{}

}

/* =========================================================
   TELEGRAM
========================================================= */

function telegram(){

  if(!window.Telegram?.WebApp)
    return;

  tg = window.Telegram.WebApp;

  try{
    tg.ready();
  }catch{}

  /*
    Intentionally NOT using tg.expand()
    because SINAPS should remain in the normal
    Telegram Mini App window.
  */

  user =
    tg.initDataUnsafe?.user ||
    null;

  initData =
    tg.initData ||
    '';

  if(!user)
    return;

  if($('username')){

    $('username').textContent =
      user.username
      ? '@' + user.username
      : (
          user.first_name ||
          'SINAPS User'
        );

  }

  if($('avatarLetter')){

    $('avatarLetter').textContent =
      (
        user.first_name ||
        user.username ||
        'S'
      )
      .charAt(0)
      .toUpperCase();

  }

  if(user.photo_url && $('userAvatar')){

    $('userAvatar').src =
      user.photo_url;

    $('userAvatar').style.display =
      'block';

    if($('avatarLetter'))
      $('avatarLetter').style.display =
        'none';

  }

}

/* =========================================================
   USER
========================================================= */

async function loadUser(){

  if(!user?.id)
    return;

  try{

    const data = await api(
      '/api/user',
      {
        method:'POST',
        body:JSON.stringify({
          telegram_id:user.id,
          username:
            user.username ||
            user.first_name ||
            '',
          start_param:
            tg?.initDataUnsafe?.start_param ||
            ''
        })
      }
    );

    const u = data.user || {};

    /*
      Backend is the source of truth.
    */

    if(!pending && !queue){

      if(u.balance !== undefined)
        balance = Number(u.balance) || 0;

      if(u.energy !== undefined)
        energy = Number(u.energy) || 0;

      if(u.max_energy !== undefined)
        maxEnergy =
          Number(u.max_energy) || 1000;

      /*
        Keep local wallet if backend doesn't
        return one.
      */

      if(u.wallet_address){

        walletAddress =
          String(u.wallet_address);

      }

      render();
      save();

    }

  }catch(e){

    console.log('loadUser:', e);

    /*
      Do not destroy local state if backend
      is temporarily unavailable.
    */

    render();

  }

}

/* =========================================================
   TAP
========================================================= */

async function sendTap(){

  if(!user?.id)
    throw new Error('Telegram user not found');

  return api(
    '/api/tap',
    {
      method:'POST',
      body:JSON.stringify({
        telegram_id:user.id,
        amount:TAP_POWER
      })
    }
  );

}

async function processTaps(){

  if(processing || !queue)
    return;

  processing = true;

  while(queue > 0){

    try{

      const data = await sendTap();

      queue = Math.max(0, queue - 1);
      pending = Math.max(0, pending - 1);

      const u = data.user || {};

      /*
        Backend result is accepted when available.
      */

      if(u.balance !== undefined)
        balance = Number(u.balance) || balance;

      if(u.energy !== undefined)
        energy = Number(u.energy);

      if(u.max_energy !== undefined)
        maxEnergy =
          Number(u.max_energy) || maxEnergy;

      render();
      save();

    }catch(error){

      console.log('Tap error:', error);

      /*
        Don't leave the queue permanently stuck.
      */

      queue = Math.max(0, queue - 1);
      pending = Math.max(0, pending - 1);

      render();
      save();

      setTimeout(() => {

        if(queue > 0)
          processTaps();

      }, 1000);

      break;
    }

  }

  processing = false;

}

/* =========================================================
   TAP UI
========================================================= */

function tap(){

  const area = $('tapArea');

  if(!area)
    return;

  area.addEventListener(
    'pointerdown',
    e => {

      e.preventDefault();

      if(!user?.id){

        notify('Please open SINAPS from Telegram');

        return;
      }

      if(energy <= 0){

        notify('No energy');

        return;
      }

      /*
        Double Tap is active.
      */

      const earned = TAP_POWER;

      balance += earned;
      energy = Math.max(0, energy - 1);

      queue++;
      pending++;

      render();
      save();

      /*
        Floating reward
      */

      const rect =
        area.getBoundingClientRect();

      const floater =
        document.createElement('div');

      floater.className =
        'floater';

      floater.textContent =
        '+' + earned;

      floater.style.left =
        (e.clientX - rect.left) + 'px';

      floater.style.top =
        (e.clientY - rect.top) + 'px';

      $('floaters')?.appendChild(floater);

      setTimeout(() => {
        floater.remove();
      }, 700);

      /*
        Coin animation
      */

      $('sCoin')?.classList.add('hit');

      setTimeout(() => {

        $('sCoin')?.classList.remove('hit');

      }, 120);

      processTaps();

    },
    {
      passive:false
    }
  );

}

/* =========================================================
   ENERGY
========================================================= */

function startEnergy(){

  clearInterval(energyTimer);

  energyTimer =
    setInterval(() => {

      if(energy < maxEnergy){

        energy++;

        render();
        save();

      }

    }, ENERGY_REGEN_MS);

}

/* =========================================================
   TASKS
========================================================= */

async function loadTasks(){

  if(!user?.id)
    return;

  try{

    const data =
      await api(
        '/api/tasks?telegram_id=' +
        encodeURIComponent(user.id)
      );

    const tasks =
      data.tasks || [];

    const box =
      $('tasksList');

    if(!box)
      return;

    box.innerHTML =
      tasks.map(task => `

        <div class="task-card">

          <div class="task-icon">
            ${esc(task.icon || '✓')}
          </div>

          <div class="task-info">

            <b>
              ${esc(task.title)}
            </b>

            <span>
              +${Number(task.reward || 0).toLocaleString()}
              SNP
            </span>

          </div>

          ${
            task.completed

            ? `
              <button
                class="task-btn done"
                type="button"
              >
                ✓ Done
              </button>
            `

            : `
              <button
                class="task-btn"
                type="button"
                onclick="window.sinapsClaimTask('${esc(task.id)}')"
              >
                ${esc(task.action || 'Verify')}
              </button>
            `
          }

        </div>

      `).join('');

  }catch(error){

    console.log('loadTasks:', error);

  }

}

window.sinapsClaimTask =
async function(taskId){

  if(!user?.id)
    return;

  try{

    const data =
      await api(
        '/api/tasks/claim',
        {
          method:'POST',
          body:JSON.stringify({
            telegram_id:user.id,
            task_id:taskId
          })
        }
      );

    if(data.ok){

      if(data.balance !== undefined){

        balance =
          Number(data.balance) ||
          balance;

      }

      render();
      save();

      notify(
        '+' +
        Number(data.reward || 0)
          .toLocaleString() +
        ' SNP received',
        true
      );

      loadTasks();
      loadHistory();

    }

  }catch(error){

    notify(
      error.message ||
      'Please try again'
    );

  }

};

/* =========================================================
   DAILY
========================================================= */

async function loadDaily(){

  if(!user?.id)
    return;

  try{

    const data =
      await api(
        '/api/daily/status?telegram_id=' +
        encodeURIComponent(user.id)
      );

    renderDaily(data);

  }catch(error){

    console.log('loadDaily:', error);

  }

}

function renderDaily(data){

  let box =
    $('dailyModal');

  if(!box){

    box =
      document.createElement('div');

    box.id =
      'dailyModal';

    box.className =
      'sinaps-modal';

    document.body.appendChild(box);

  }

  const day =
    Number(data.current_day || 1);

  const claimed =
    Boolean(data.claimed);

  box.innerHTML = `

    <div class="modal-card daily-card">

      <button
        class="modal-close"
        type="button"
        onclick="
          document.getElementById('dailyModal').remove()
        "
      >
        ×
      </button>

      <h2>
        🎁 Daily Rewards
      </h2>

      <p>
        Keep your streak and collect SNP every day.
      </p>

      <div class="daily-grid">

        ${
          Array.from(
            {length:30},
            (_,i) => {

              const n =
                i + 1;

              const reward =
                n * 10;

              let cls = '';

              if(n < day)
                cls = 'past';

              if(n === day)
                cls = 'today';

              if(n > day)
                cls = 'locked';

              const canClaim =
                n === day &&
                !claimed;

              return `

                <button
                  class="daily-day ${cls}"
                  type="button"
                  ${
                    canClaim
                    ? 'onclick="window.sinapsClaimDaily()"'
                    : ''
                  }
                >

                  <strong>
                    Day ${n}
                  </strong>

                  <span>
                    ${reward} SNP
                  </span>

                  ${
                    n < day ||
                    (n === day && claimed)

                    ? '<em>✓</em>'

                    : ''
                  }

                </button>

              `;

            }
          ).join('')
        }

      </div>

    </div>

  `;

}

window.sinapsOpenDaily =
async function(){

  await loadDaily();

  const modal =
    $('dailyModal');

  if(modal)
    modal.style.display =
      'flex';

};

window.sinapsClaimDaily =
async function(){

  if(!user?.id)
    return;

  try{

    const data =
      await api(
        '/api/daily/claim',
        {
          method:'POST',
          body:JSON.stringify({
            telegram_id:user.id
          })
        }
      );

    if(data.balance !== undefined){

      balance =
        Number(data.balance) ||
        balance;

    }

    render();
    save();

    notify(
      '+' +
      Number(data.reward || 0)
        .toLocaleString() +
      ' SNP',
      true
    );

    await loadDaily();
    loadHistory();

  }catch(error){

    notify(
      error.message ||
      'Unable to claim daily reward'
    );

  }

};

/* =========================================================
   FRIENDS
========================================================= */

async function loadFriends(){

  if(!user?.id)
    return;

  try{

    const data =
      await api(
        '/api/friends?telegram_id=' +
        encodeURIComponent(user.id)
      );

    if($('inviteCode')){

      $('inviteCode').textContent =
        data.referral_code || '';

    }

    if($('friendsCount')){

      $('friendsCount').textContent =
        Number(data.count || 0)
          .toLocaleString();

    }

    const list =
      $('friendsList');

    if(!list)
      return;

    list.innerHTML =
      (data.friends || [])
        .map(friend => `

          <div class="friend-row">

            <span>
              ${esc(friend.username || 'User')}
            </span>

            <strong>
              ${Number(friend.balance || 0)
                .toLocaleString()}
              SNP
            </strong>

          </div>

        `)
        .join('') ||
      `
        <div class="empty">
          No friends yet
        </div>
      `;

  }catch(error){

    console.log('loadFriends:', error);

  }

}

window.sinapsCopyInvite =
async function(){

  const code =
    $('inviteCode')?.textContent || '';

  if(!code)
    return;

  const link =
    'https://t.me/SNPCOINBot?start=' +
    encodeURIComponent(code);

  try{

    await navigator.clipboard.writeText(link);

    notify(
      'Invite link copied',
      true
    );

  }catch{

    notify(link);

  }

};

/* =========================================================
   HISTORY
========================================================= */

async function loadHistory(){

  if(!user?.id)
    return;

  try{

    const data =
      await api(
        '/api/history?telegram_id=' +
        encodeURIComponent(user.id)
      );

    const box =
      $('historyList');

    if(!box)
      return;

    box.innerHTML =
      (data.transactions || [])
        .map(transaction => {

          const amount =
            Number(transaction.amount || 0);

          return `

            <div class="history-row">

              <div>

                <b>
                  ${esc(
                    transaction.type ||
                    'Transaction'
                  )}
                </b>

                <small>
                  ${esc(
                    transaction.created_at ||
                    ''
                  )}
                </small>

              </div>

              <strong
                class="${amount >= 0 ? 'plus' : 'minus'}"
              >

                ${
                  amount >= 0
                  ? '+'
                  : ''
                }

                ${amount.toLocaleString()}
                SNP

              </strong>

              <span class="status">

                ${esc(
                  transaction.status ||
                  'Completed'
                )}

              </span>

            </div>

          `;

        })
        .join('') ||
      `
        <div class="empty">
          No transactions yet
        </div>
      `;

  }catch(error){

    console.log('loadHistory:', error);

  }

}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation(){

  document.addEventListener(
    'click',
    event => {

      const nav =
        event.target.closest('[data-page]');

      if(!nav)
        return;

      const page =
        nav.dataset.page;

      /*
        Update active buttons.
      */

      document
        .querySelectorAll('[data-page]')
        .forEach(element => {

          element.classList.remove('active');

        });

      nav.classList.add('active');

      /*
        Hide all pages.
      */

      document
        .querySelectorAll('.page')
        .forEach(element => {

          element.style.display =
            'none';

        });

      /*
        Show selected page.
      */

      const target =
        $('page-' + page);

      if(target){

        target.style.display =
          'block';

      }

      /*
        Load page data.
      */

      if(page === 'tasks')
        loadTasks();

      if(page === 'friends')
        loadFriends();

      if(page === 'wallet'){

        render();
        loadHistory();

      }

      if(page === 'home')
        render();

    }
  );

}

/* =========================================================
   WALLET
========================================================= */

function renderWallet(){

  const element =
    $('walletAddress');

  if(!element)
    return;

  if(walletAddress){

    element.textContent =
      shortAddress(walletAddress);

    /*
      IMPORTANT:
      Used by withdrawal.
    */

    element.dataset.address =
      walletAddress;

  }else{

    element.textContent =
      'Not connected';

    element.dataset.address =
      '';

  }

}

async function connectWallet(){

  try{

    if(!window.TON_CONNECT_UI){

      notify(
        'TON Connect is loading...'
      );

      return;

    }

    tonUI =
      new TON_CONNECT_UI.TonConnectUI({
        manifestUrl:MANIFEST,
        buttonRootId:'ton-connect'
      });

    /*
      Existing wallet status
    */

    tonUI.onStatusChange(
      async wallet => {

        if(!wallet){

          /*
            Do not immediately erase the locally
            saved address because TON Connect can
            briefly report null during initialization.
          */

          renderWallet();

          return;

        }

        const address =
          wallet.account?.address || '';

        if(!address)
          return;

        walletAddress =
          address;

        renderWallet();
        save();

        try{

          await api(
            '/api/wallet/connect',
            {
              method:'POST',
              body:JSON.stringify({
                telegram_id:user.id,
                wallet_address:address
              })
            }
          );

          notify(
            'Wallet connected',
            true
          );

        }catch(error){

          notify(
            error.message ||
            'Wallet could not be saved'
          );

        }

      }
    );

    /*
      Render saved wallet immediately.
    */

    renderWallet();

  }catch(error){

    console.log('connectWallet:', error);

    notify(
      error.message ||
      'TON Connect error'
    );

  }

}

/* =========================================================
   WITHDRAW
========================================================= */

window.sinapsWithdraw =
async function(){

  if(withdrawing)
    return;

  if(!user?.id){

    notify(
      'Please open SINAPS from Telegram'
    );

    return;

  }

  const input =
    $('withdrawAmount');

  const amount =
    Number(input?.value || 0);

  if(!amount || amount <= 0){

    notify(
      'Enter SNP amount'
    );

    return;

  }

  if(amount > balance){

    notify(
      'Insufficient SNP balance'
    );

    return;

  }

  /*
    Always use saved wallet address.
  */

  const wallet =
    walletAddress ||
    $('walletAddress')?.dataset?.address ||
    '';

  if(!wallet){

    notify(
      'Connect wallet first'
    );

    return;

  }

  if(!tonUI){

    notify(
      'TON Connect is not ready'
    );

    return;

  }

  withdrawing = true;

  try{

    /*
      Create withdrawal record.
    */

    const data =
      await api(
        '/api/withdraw/create',
        {
          method:'POST',
          body:JSON.stringify({
            telegram_id:user.id,
            wallet_address:wallet,
            amount
          })
        }
      );

    if(!data.withdrawal_id){

      throw new Error(
        'Withdrawal could not be created'
      );

    }

    /*
      Treasury transaction.

      NOTE:
      This transaction pays the TON network fee.
      The backend should perform/verify the actual
      SNP withdrawal according to its own logic.
    */

    const tx = {

      validUntil:
        Math.floor(Date.now()/1000) + 600,

      messages:[
        {
          address:TREASURY,
          amount:FEE
        }
      ]

    };

    await tonUI.sendTransaction(tx);

    /*
      Verify transaction with backend.
    */

    await api(
      '/api/withdraw/verify',
      {
        method:'POST',
        body:JSON.stringify({
          telegram_id:user.id,
          withdrawal_id:data.withdrawal_id,
          wallet_address:wallet
        })
      }
    );

    /*
      Refresh user state.
    */

    await loadUser();

    if(input)
      input.value = '';

    notify(
      'Payment submitted. Withdrawal is being reviewed.',
      true
    );

    loadHistory();

  }catch(error){

    console.log('withdraw:', error);

    notify(
      error.message ||
      'Withdrawal failed'
    );

  }finally{

    withdrawing = false;

  }

};

/* =========================================================
   DEMO GAMES
========================================================= */

window.sinapsCrashDemo =
function(){

  const result =
    $('gameResult');

  if(!result)
    return;

  result.textContent =
    '🚀 Launching...';

  let x = 1;

  const timer =
    setInterval(() => {

      x += Math.random() * 0.15;

      result.textContent =
        '🚀 ' +
        x.toFixed(2) +
        'x';

      if(Math.random() < 0.025){

        clearInterval(timer);

        result.textContent =
          '💥 CRASHED at ' +
          x.toFixed(2) +
          'x';

      }

    },120);

};

window.sinapsPlinkoDemo =
function(){

  const result =
    $('gameResult');

  if(!result)
    return;

  const values = [
    '0.2x',
    '0.5x',
    '1x',
    '2x',
    '5x',
    '10x'
  ];

  result.textContent =
    '🎯 ' +
    values[
      Math.floor(
        Math.random() *
        values.length
      )
    ];

};

/* =========================================================
   INIT
========================================================= */

async function init(){

  load();

  telegram();

  render();

  setupNavigation();

  tap();

  startEnergy();

  /*
    Render saved wallet immediately.
  */

  renderWallet();

  /*
    Load backend user.
  */

  await loadUser();

  /*
    Connect TON after Telegram/user initialization.
  */

  connectWallet();

  /*
    Load additional data.
  */

  if(user?.id){

    loadTasks();
    loadDaily();
    loadFriends();
    loadHistory();

  }

  /*
    Daily button.
  */

  const gift =
    $('dailyGift');

  if(gift){

    gift.addEventListener(
      'click',
      window.sinapsOpenDaily
    );

  }

}

/* =========================================================
   START
========================================================= */

if(document.readyState === 'loading'){

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

}else{

  init();

}

})();
