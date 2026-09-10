const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

// ===============================
// SINAPS BACKEND
// ===============================

const API = 'https://sinaps-backend.onrender.com';

const tgUser = tg?.initDataUnsafe?.user || null;

const telegramId = tgUser?.id || null;
const username = tgUser?.username || null;

// ===============================
// LOCAL STATE
// ===============================

const KEY = 'sinaps_v1_state';

const state = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  points: 0,
  energy: 1000,
  maxEnergy: 1000,
  level: 1,
  lastEnergy: Date.now(),
  daily: null
};

const $ = id => document.getElementById(id);

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ===============================
// BACKEND USER
// ===============================

async function loadUser() {
  if (!telegramId) {
    console.log('Telegram user not detected');
    return;
  }

  try {
    const response = await fetch(`${API}/api/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telegram_id: telegramId,
        username: username
      })
    });

    if (!response.ok) {
      throw new Error('Backend user request failed');
    }

    const user = await response.json();

    state.points = Number(user.balance || 0);
    state.energy = Number(user.energy ?? 1000);
    state.maxEnergy = Number(user.max_energy ?? 1000);

    state.lastEnergy = Date.now();

    save();
    render();

    console.log('SINAPS user loaded:', user);

  } catch (error) {
    console.error('Load user error:', error);
  }
}

// ===============================
// ENERGY
// ===============================

function regen() {
  const now = Date.now();

  const elapsed = Math.floor(
    (now - state.lastEnergy) / 3000
  );

  if (elapsed > 0) {
    state.energy = Math.min(
      state.maxEnergy,
      state.energy + elapsed
    );

    state.lastEnergy = now;

    save();
  }
}

// ===============================
// RENDER
// ===============================

function render() {
  regen();

  if ($('points')) {
    $('points').textContent =
      state.points.toLocaleString();
  }

  state.level =
    Math.floor(state.points / 1000) + 1;

  if ($('level')) {
    $('level').textContent = state.level;
  }

  if ($('energyText')) {
    $('energyText').textContent = state.energy;
  }

  if ($('energyFill')) {
    $('energyFill').style.width =
      (state.energy / state.maxEnergy * 100) + '%';
  }
}

// ===============================
// ADD POINTS
// ===============================

function addPoints(n) {
  state.points += n;
  save();
  render();
}

// ===============================
// TAP BACKEND
// ===============================

let tapBusy = false;

async function sendTap() {

  if (!telegramId) {
    // Demo mode
    if (state.energy <= 0) return;

    state.energy--;
    addPoints(1);
    return;
  }

  if (tapBusy) return;

  if (state.energy <= 0) {
    return;
  }

  tapBusy = true;

  try {

    const response = await fetch(`${API}/api/tap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telegram_id: telegramId
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Tap error:', result);
      return;
    }

    // دریافت موجودی واقعی از Backend
    state.points = Number(result.balance);
    state.energy = Number(result.energy);

    state.lastEnergy = Date.now();

    save();
    render();

  } catch (error) {

    console.error('Tap request failed:', error);

  } finally {

    tapBusy = false;

  }
}

// ===============================
// TAP BUTTON
// ===============================

if ($('tap')) {

  $('tap').addEventListener('pointerdown', async e => {

    if (state.energy <= 0) return;

    // نمایش افکت سریع
    const f = document.createElement('div');

    f.className = 'floater';
    f.textContent = '+1';

    f.style.left =
      (e.offsetX - 5) + 'px';

    f.style.top =
      (e.offsetY - 10) + 'px';

    $('floaters').appendChild(f);

    setTimeout(() => {
      f.remove();
    }, 750);

    await sendTap();

  });

}

// ===============================
// DAILY BONUS
// ===============================

if ($('daily')) {

  $('daily').onclick = () => {

    const today =
      new Date().toISOString().slice(0, 10);

    if (state.daily === today) {

      alert('Daily bonus already claimed.');

      return;
    }

    state.daily = today;

    addPoints(100);

    alert('+100 points claimed!');

  };

}

// ===============================
// REFERRAL
// ===============================

if ($('invite')) {

  $('invite').onclick = () => {

    const id =
      telegramId || 'demo';

    const link =
      location.origin +
      location.pathname +
      '?ref=' +
      id;

    navigator.clipboard?.writeText(link);

    alert(
      'Referral link copied (demo):\n' +
      link
    );

  };

}

// ===============================
// TASKS
// ===============================

if ($('tasks')) {

  $('tasks').onclick = () => {

    alert(
      'Tasks module is reserved for v1.1.'
    );

  };

}

// ===============================
// LEADERBOARD
// ===============================

if ($('leaderboard')) {

  $('leaderboard').onclick = () => {

    alert(
      'Leaderboard backend is reserved for v1.1.'
    );

  };

}

// ===============================
// WALLET
// ===============================

if ($('walletBtn')) {

  $('walletBtn').onclick = () => {

    alert(
      'TON Connect is planned for the next build.\n\n' +
      'Never enter a seed phrase into SINAPS.'
    );

  };

}

// ===============================
// RESET
// ===============================

if ($('reset')) {

  $('reset').onclick = () => {

    if (
      confirm('Reset demo data?')
    ) {

      localStorage.removeItem(KEY);

      location.reload();

    }

  };

}

// ===============================
// TELEGRAM USER
// ===============================

if (tgUser) {

  const name =
    tgUser.first_name ||
    tgUser.username ||
    'SINAPS user';

  if ($('status')) {
    $('status').textContent =
      'Welcome ' + name;
  }

}

// ===============================
// START
// ===============================

render();

// دریافت اطلاعات واقعی کاربر از Backend
loadUser();

// بروزرسانی نمایش
setInterval(render, 1000);
