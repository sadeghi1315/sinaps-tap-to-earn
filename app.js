const tg = window.Telegram?.WebApp || null;
if (tg) {
  tg.ready();
  tg.setHeaderColor("#02030d");
  tg.setBackgroundColor("#02030d");
}

const API = "https://sinaps-backend.onrender.com";
const TON_MANIFEST = "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json";

const state = {
  balance: 0, energy: 1000, maxEnergy: 1000, tapPower: 1,
  rechargeMultiplier: 1, tapBoostLevel: 1, energyBoostLevel: 1, rechargeLevel: 1,
  walletAddress: null, username: "", referralCode: "", currentPage: "home"
};

let tonUI = null;
let tapQueue = 0;
let tapTimer = null;
let energyTimer = null;
let walletInitialized = false;
let disconnectRequested = false;

const $ = id => document.getElementById(id);
const formatNumber = value => Number(value || 0).toLocaleString("en-US");
const telegramUser = () => tg?.initDataUnsafe?.user || null;
const authHeaders = () => ({ "Content-Type": "application/json", "X-Telegram-Init-Data": tg?.initData || "" });

async function api(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2400);
}

function shortAddress(address) {
  if (!address) return "";
  return address.length > 15 ? `${address.slice(0, 5)}...${address.slice(-5)}` : address;
}

// ============================================================
// USER
// ============================================================
function applyUser(user) {
  if (!user) return;
  state.balance = Number(user.balance || 0);
  state.energy = Number(user.energy || 0);
  state.maxEnergy = Number(user.max_energy || 1000);
  state.tapPower = Number(user.tap_power || 1);
  state.rechargeMultiplier = Number(user.recharge_multiplier || 1);
  state.tapBoostLevel = Number(user.tap_boost_level || 1);
  state.energyBoostLevel = Number(user.energy_boost_level || 1);
  state.rechargeLevel = Number(user.recharge_level || 1);
  state.walletAddress = user.wallet_address || null;
  state.referralCode = user.referral_code || state.referralCode || "";
  renderUser();
  renderWallet();
}

function renderUser() {
  const user = telegramUser();
  if ($("username")) $("username").textContent = user?.username ? `@${user.username}` : (user?.first_name || "@user");
  if ($("balance")) $("balance").textContent = formatNumber(state.balance);
  if ($("boostBalance")) $("boostBalance").textContent = formatNumber(state.balance);
  renderEnergy();
}

async function loadUser() {
  try {
    const user = telegramUser();
    const data = await api("/api/user", {
      method: "POST",
      body: JSON.stringify({ username: user?.username || "", start_param: tg?.initDataUnsafe?.start_param || "" })
    });
    applyUser(data.user);
    await Promise.allSettled([loadBoosts(), loadDaily(), loadTasks(), loadFriends(), loadWallet()]);
  } catch (e) {
    console.error("loadUser", e);
    toast(e.message || "Server connection failed");
  }
}

// ============================================================
// ENERGY
// ============================================================
function renderEnergy() {
  const energy = Math.max(0, Math.min(Number(state.energy || 0), Number(state.maxEnergy || 1000)));
  if ($("energy")) $("energy").textContent = `${formatNumber(energy)} / ${formatNumber(state.maxEnergy)}`;
  if ($("energyFill")) $("energyFill").style.width = `${state.maxEnergy ? (energy / state.maxEnergy) * 100 : 0}%`;
}

function startEnergyTimer() {
  clearInterval(energyTimer);
  energyTimer = setInterval(() => {
    if (state.energy < state.maxEnergy) {
      state.energy = Math.min(state.maxEnergy, state.energy + 1);
      renderEnergy();
    }
  }, Math.max(500, 3000 / Math.max(1, state.rechargeMultiplier)));
}

// ============================================================
// TAP
// ============================================================
function showTapNumber(event, amount) {
  const area = $("tapArea"), container = $("floaters");
  if (!area || !container) return;
  const rect = area.getBoundingClientRect();
  const x = event?.clientX ?? rect.left + rect.width / 2;
  const y = event?.clientY ?? rect.top + rect.height / 2;
  const el = document.createElement("div");
  el.className = "tap-floater";
  el.textContent = `+${amount}`;
  el.style.left = `${x - rect.left}px`;
  el.style.top = `${y - rect.top}px`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function tap(event) {
  if (state.energy <= 0) return toast("No energy");
  const reward = state.tapPower;
  state.energy -= 1;
  state.balance += reward;
  tapQueue += 1;
  renderUser();
  showTapNumber(event, reward);
  if (!tapTimer) tapTimer = setTimeout(flushTaps, 100);
}

async function flushTaps() {
  clearTimeout(tapTimer); tapTimer = null;
  if (tapQueue <= 0) return;
  const count = Math.min(tapQueue, 50);
  tapQueue -= count;
  try {
    const data = await api("/api/tap", { method: "POST", body: JSON.stringify({ count }) });
    applyUser(data.user);
  } catch (e) {
    console.error("tap", e);
    await loadUser();
  }
  if (tapQueue > 0) tapTimer = setTimeout(flushTaps, 100);
}

// ============================================================
// BOOSTS
// ============================================================
async function loadBoosts() {
  try {
    const data = await api("/api/boosts");
    renderBoosts(data.boosts || []);
    if ($("boostBalance")) $("boostBalance").textContent = formatNumber(data.balance);
  } catch (e) { console.error("boosts", e); }
}

function renderBoosts(boosts) {
  const container = $("boostsList");
  if (!container) return;
  container.innerHTML = "";
  const meta = {
    tap: { title: "⚡ Tap Power", icon: "⚡", current: state.tapPower, suffix: "SNP per tap" },
    energy: { title: "🔋 Energy Capacity", icon: "🔋", current: state.maxEnergy, suffix: "maximum energy" },
    recharge: { title: "🚀 Energy Recharge", icon: "🚀", current: state.rechargeMultiplier, suffix: "× recharge speed" }
  };
  boosts.forEach(item => {
    const m = meta[item.type];
    const next = item.next;
    const card = document.createElement("div");
    card.className = "boost-card";
    if (!next) card.classList.add("maxed");
    let currentText = item.type === "tap" ? `${item.current_level} SNP / tap` : item.type === "energy" ? `${formatNumber(item.current_level * 1000)} max energy` : `${item.current_level}× faster recharge`;
    let nextText = next ? (item.type === "tap" ? `${next.level} SNP / tap` : item.type === "energy" ? `${formatNumber(next.level * 1000)} max energy` : `${next.level}× faster recharge`) : "Maximum level reached";
    card.innerHTML = `
      <div class="boost-icon">${m.icon}</div>
      <div class="boost-info">
        <div class="boost-name">${m.title.replace(/^\S+\s/, "")}</div>
        <div class="boost-current">Level ${item.current_level} · ${currentText}</div>
        <div class="boost-next">${next ? `Next: ${nextText}` : nextText}</div>
      </div>
      <button class="boost-buy" ${next ? `data-type="${item.type}"` : "disabled"}>
        ${next ? `${formatNumber(next.price)} SNP` : "MAX"}
      </button>`;
    container.appendChild(card);
  });
  container.querySelectorAll(".boost-buy[data-type]").forEach(btn => btn.addEventListener("click", () => buyBoost(btn.dataset.type)));
}

async function buyBoost(type) {
  try {
    const data = await api("/api/boosts/buy", { method: "POST", body: JSON.stringify({ type }) });
    applyUser(data.user);
    toast(data.message || "Boost activated");
    startEnergyTimer();
    await loadBoosts();
  } catch (e) { toast(e.message); }
}

// ============================================================
// DAILY REWARDS
// ============================================================

function localDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function loadDaily() {
  const grid = $("dailyGrid");
  if (!grid) return;

  try {
    const user = telegramUser();

    if (!user?.id) {
      renderDaily({
        streak: 0,
        last_claim_date: null
      });
      return;
    }

    const data = await api(
      `/api/daily?telegram_id=${encodeURIComponent(user.id)}`
    );

    renderDaily(data.daily || data);
  } catch (e) {
    console.error("Daily load error:", e);

    // حتی اگر سرور موقتاً پاسخ نداد،
    // جدول 30 روزه خالی نماند.
    renderDaily({
      streak: 0,
      last_claim_date: null
    });

    toast("Daily rewards could not be loaded");
  }
}

function renderDaily(data = {}) {
  const grid = $("dailyGrid");
  if (!grid) return;

  const streak = Math.max(
    0,
    Math.min(30, Number(data.streak || 0))
  );

  const lastClaimDate = data.last_claim_date || null;
  const today = localDateKey();

  const claimedToday = lastClaimDate === today;

  // اگر امروز claim نشده باشد، روز بعدی قابل دریافت است.
  const currentDay = claimedToday
    ? streak
    : Math.min(streak + 1, 30);

  grid.innerHTML = "";

  for (let day = 1; day <= 30; day++) {
// ============================================================
// DAILY REWARDS
// ============================================================

function localDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// تبدیل هر نوع تاریخ سرور به YYYY-MM-DD
function normalizeDateKey(value) {
  if (!value) return null;

  // اگر سرور مستقیماً YYYY-MM-DD داده باشد
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

async function loadDaily() {
  const grid = $("dailyGrid");
  if (!grid) return;

  try {
    const user = telegramUser();

    if (!user?.id) {
      renderDaily({
        streak: 0,
        last_claim_date: null
      });
      return;
    }

    const data = await api(
      `/api/daily?telegram_id=${encodeURIComponent(user.id)}`
    );

    console.log("DAILY SERVER DATA:", data);

    renderDaily(data.daily || data);

  } catch (e) {
    console.error("Daily load error:", e);

    renderDaily({
      streak: 0,
      last_claim_date: null
    });

    toast("Daily rewards could not be loaded");
  }
}

function renderDaily(data = {}) {
  const grid = $("dailyGrid");
  if (!grid) return;

  const streak = Math.max(
    0,
    Math.min(30, Number(data.streak || 0))
  );

  // پشتیبانی از چند نام احتمالی که بک‌اند ممکن است برگرداند
  const rawLastClaim =
    data.last_claim_date ??
    data.lastClaimDate ??
    data.last_claim ??
    data.claimed_date ??
    null;

  const lastClaimDate = normalizeDateKey(rawLastClaim);
  const today = localDateKey();

  // آیا امروز قبلاً جایزه گرفته شده؟
  const claimedToday =
    Boolean(lastClaimDate) &&
    lastClaimDate === today;

  console.log("DAILY STATUS:", {
    streak,
    rawLastClaim,
    lastClaimDate,
    today,
    claimedToday
  });

  /*
    اگر امروز گرفته نشده:
      روز بعدی = streak + 1

    اگر امروز گرفته شده:
      همان روز streak به عنوان دریافت‌شده نمایش داده می‌شود.
  */
  const currentDay = claimedToday
    ? Math.max(1, Math.min(streak, 30))
    : Math.min(streak + 1, 30);

  grid.innerHTML = "";

  for (let day = 1; day <= 30; day++) {

    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "daily-day";

    const reward = day * 10;

    let status = "locked";
    let icon = "🔒";

    // -----------------------------------------
    // روزهای قبلی دریافت شده
    // -----------------------------------------
    if (day < currentDay) {
      status = "claimed";
      icon = "✓";
    }

    // -----------------------------------------
    // روز فعلی که هنوز دریافت نشده
    // -----------------------------------------
    if (!claimedToday && day === currentDay) {
      status = "current";
      icon = "CLAIM";
    }

    // -----------------------------------------
    // امروز دریافت شده
    // این قسمت باعث می‌شود تیک سبز روی همان روز بیاید
    // -----------------------------------------
    if (claimedToday && day === currentDay) {
      status = "claimed";
      icon = "✓";
    }

    cell.classList.add(status);

    cell.innerHTML = `
      <span class="daily-day-number">DAY ${day}</span>
      <strong>${formatNumber(reward)} SNP</strong>
      <span class="daily-check">${icon}</span>
    `;

    // فقط روز قابل دریافت قابل کلیک است
    if (status === "current") {
      cell.addEventListener("click", claimDaily);
    }

    grid.appendChild(cell);
  }

  // -----------------------------------------
  // نقطه قرمز روی هدیه
  // اگر امروز گرفته شده باشد حذف می‌شود
  // -----------------------------------------
  if ($("dailyDot")) {
    $("dailyDot").classList.toggle("hidden", claimedToday);
  }
}

async function claimDaily() {
  try {

    const button = document.querySelector(".daily-day.current");

    if (button) {
      button.disabled = true;
      button.style.pointerEvents = "none";
    }

    const data = await api("/api/daily/claim", {
      method: "POST",
      body: "{}"
    });

    console.log("DAILY CLAIM RESPONSE:", data);

    // -----------------------------------------
    // آپدیت موجودی
    // -----------------------------------------
    if (data.user) {
      applyUser(data.user);

    } else if (data.balance !== undefined) {
      state.balance = Number(data.balance);
      renderUser();

    } else if (data.reward !== undefined) {
      state.balance += Number(data.reward || 0);
      renderUser();
    }

    const reward = Number(data.reward || 0);
    const day = Number(data.day || 1);

    toast(
      `🎁 +${formatNumber(reward)} SNP · Day ${day}`
    );

    // -----------------------------------------
    // خیلی مهم:
    // بعد از Claim وضعیت را دوباره از سرور بگیر
    // تا تیک ✓ روی روز قرار بگیرد
    // -----------------------------------------
    await loadDaily();

  } catch (e) {

    console.error("Daily claim error:", e);

    toast(
      e.message || "Daily reward unavailable"
    );

    const button =
      document.querySelector(".daily-day.current");

    if (button) {
      button.disabled = false;
      button.style.pointerEvents = "";
    }
  }
}

function openDaily() {
  const modal = $("dailyModal");
  if (!modal) return;

  modal.classList.add("show");

  // هر بار باز شدن، وضعیت واقعی سرور را بگیر
  loadDaily();
}

function closeDaily() {
  $("dailyModal")?.classList.remove("show");
}
// ============================================================
// WALLET
// ============================================================
function renderWallet() {
  const address = $("walletAddress"), disconnect = $("disconnectWallet"), walletStatus = $("walletStatus"),
        connectButton = $("connectWalletButton");
  if (state.walletAddress) {
    if (address) address.textContent = state.walletAddress;
    if (walletStatus) walletStatus.textContent = "TON wallet connected";
    if (disconnect) disconnect.style.display = "block";
    if (connectButton) connectButton.style.display = "none";
  } else {
    if (address) address.textContent = "Not connected";
    if (walletStatus) walletStatus.textContent = "Connect your TON wallet";
    if (disconnect) disconnect.style.display = "none";
    if (connectButton) connectButton.style.display = "block";
  }
}

async function initWallet() {
  try {
    if (!window.TON_CONNECT_UI?.TonConnectUI) {
      console.error("TON Connect UI missing");
      return;
    }
    // Official TON Connect button is rendered directly in the top-right header.
    tonUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TON_MANIFEST,
      buttonRootId: "ton-connect-top"
    });

    tonUI.onStatusChange(async wallet => {
      walletInitialized = true;
      const address = wallet?.account?.address || null;
      state.walletAddress = address;
      renderWallet();

      if (address) {
        try {
          const data = await api("/api/wallet/connect", {
            method: "POST",
            body: JSON.stringify({ wallet_address: address })
          });
          applyUser(data.user);
          if (Number(data.referral_reward || 0) > 0) {
            toast(`Referral activated: +${formatNumber(data.referral_reward)} SNP`);
          }
          await loadFriends();
        } catch (e) {
          toast("Wallet connected, but could not be saved");
        }
      } else {
        try { await api("/api/wallet/disconnect", { method: "POST", body: "{}" }); } catch (_) {}
        await loadFriends();
        if (disconnectRequested) disconnectRequested = false;
      }
    });

    // Wait for TON Connect to restore any existing session. If there is no
    // active connection, do not display an old wallet stored in the database.
    if (tonUI.connectionRestored) {
      await tonUI.connectionRestored;
    }
    if (!state.walletAddress) {
      try { await api("/api/wallet/disconnect", { method: "POST", body: "{}" }); } catch (_) {}
    }
    renderWallet();
  } catch (e) {
    console.error("TON Connect", e);
  }
}

async function connectWallet() {
  if (!tonUI) return toast("TON Connect is not ready");
  try { await tonUI.openModal(); } catch (e) { console.error(e); toast("Could not open wallet"); }
}

async function disconnectWallet() {
  disconnectRequested = true;
  try {
    if (tonUI?.disconnect) await tonUI.disconnect();
  } catch (_) {}
  state.walletAddress = null;
  renderWallet();
  try { await api("/api/wallet/disconnect", { method: "POST", body: "{}" }); } catch (_) {}
  await loadFriends();
  toast("Wallet disconnected");
  disconnectRequested = false;
}

async function loadWallet() {
  // Do not restore an old database address. The active TON Connect session is authoritative.
  renderWallet();
}

// ============================================================
// WITHDRAW
// ============================================================
async function withdraw() {
  const amount = Number($("withdrawAmount")?.value || 0);
  if (!Number.isInteger(amount) || amount <= 0) return toast("Enter a valid amount");
  if (!state.walletAddress) return toast("Connect your wallet first");
  if (amount > state.balance) return toast("Not enough SNP");
  try {
    const data = await api("/api/withdraw/create", { method: "POST", body: JSON.stringify({ amount, wallet_address: state.walletAddress }) });
    state.balance = Number(data.balance || state.balance);
    renderUser();
    toast("Withdrawal created");
    if (!tonUI) return;
    try {
      await tonUI.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 300, messages: [{ address: data.treasury_wallet, amount: String(data.fee_nano) }] });
      await api("/api/withdraw/verify", { method: "POST", body: JSON.stringify({ withdrawal_id: data.withdrawal_id }) });
      toast("Fee paid. SNP payout is pending.");
      $("withdrawAmount").value = "";
    } catch (e) {
      try { await api("/api/withdraw/cancel", { method: "POST", body: JSON.stringify({ withdrawal_id: data.withdrawal_id }) }); } catch (_) {}
      await loadUser();
      toast("Withdrawal cancelled");
    }
  } catch (e) { toast(e.message); }
}

// ============================================================
// TASKS
// ============================================================
async function loadTasks() {
  try {
    const data = await api("/api/tasks");
    const container = $("tasksList");
    if (!container) return;
    container.innerHTML = "";
    data.tasks.forEach(task => {
      const row = document.createElement("div");
      row.className = "task-row";
      row.innerHTML = `<div class="task-icon">${task.icon}</div><div class="task-info"><strong>${task.name}</strong><small>+${formatNumber(task.reward)} SNP</small></div><button class="task-button" ${task.completed ? "disabled" : ""} data-task-id="${task.id}" data-url="${task.url || "#"}">${task.completed ? "DONE" : task.action || "VERIFY"}</button>`;
      container.appendChild(row);
    });
    container.querySelectorAll(".task-button:not(:disabled)").forEach(btn => btn.addEventListener("click", () => claimTask(btn.dataset.taskId, btn.dataset.url)));
  } catch (e) {
    const c = $("tasksList"); if (c) c.innerHTML = `<div class="empty-state">${e.message || "Tasks unavailable"}</div>`;
  }
}
async function claimTask(taskId, url) {
  const task = { url };
  if (url && url !== "#") {
    try { if (tg?.openTelegramLink && url.includes("t.me/")) tg.openTelegramLink(url); else window.open(url, "_blank"); } catch (_) { window.open(url, "_blank"); }
    await new Promise(r => setTimeout(r, 1200));
  }
  try {
    const data = await api("/api/tasks/claim", { method: "POST", body: JSON.stringify({ task_id: taskId, wallet_address: state.walletAddress || "" }) });
    state.balance = Number(data.balance || state.balance);
    renderUser();
    toast(`+${formatNumber(data.reward)} SNP`);
    await loadTasks();
  } catch (e) { toast(e.message); }
}

// ============================================================
// FRIENDS / REFERRAL
// ============================================================
async function loadFriends() {
  try {
    const data = await api("/api/friends");
    const input = $("referralLink");
    if (input) input.value = data.referral_link || "";
    if ($("referralCode")) $("referralCode").textContent = data.referral_code || "—";
    if ($("referralFriends")) $("referralFriends").textContent = formatNumber(data.total_friends || 0);
    if ($("activeReferrals")) $("activeReferrals").textContent = formatNumber(data.active_referrals || 0);
    if ($("referralIncome")) $("referralIncome").textContent = `${formatNumber(data.total_earnings || 0)} SNP`;
    if ($("inviteReward")) $("inviteReward").textContent = `+${formatNumber(data.invite_reward || 100)} SNP`;
    if ($("referralRate")) $("referralRate").textContent = `${Math.round(Number(data.referral_rate || 0.15) * 100)}%`;

    const list = $("friendsList");
    if (!list) return;
    list.innerHTML = "";
    if (!data.friends?.length) {
      list.innerHTML = `<div class="empty-state">No invited friends yet.</div>`;
      return;
    }
    data.friends.forEach(friend => {
      const row = document.createElement("div");
      row.className = "friend-row";
      const balance = formatNumber(friend.balance || 0);
      const statusClass = friend.wallet_connected ? "friend-active" : "friend-pending";
      const status = friend.wallet_connected ? "WALLET CONNECTED" : "CONNECT WALLET";
      const reward = friend.referral_rewarded ? "REWARDED" : friend.wallet_connected ? "+100 SNP" : "LOCKED";
      row.innerHTML = `
        <div class="friend-avatar">${friend.wallet_connected ? "✓" : "👤"}</div>
        <div class="friend-main">
          <strong>${friend.username ? `@${friend.username}` : "SINAPS user"}</strong>
          <small>${new Date(friend.created_at).toLocaleDateString("en-US")} · Balance: ${balance} SNP</small>
          <span class="friend-status ${statusClass}">${status}</span>
        </div>
        <b>${reward}</b>`;
      list.appendChild(row);
    });
  } catch (e) {
    console.error("friends", e);
    const list = $("friendsList");
    if (list) list.innerHTML = `<div class="empty-state">Referral data unavailable.</div>`;
  }
}

async function copyReferral() {
  const input = $("referralLink"); if (!input?.value) return;
  try { await navigator.clipboard.writeText(input.value); toast("Referral link copied"); }
  catch (_) { input.select(); document.execCommand("copy"); toast("Copied"); }
}
function shareReferral() {
  const link = $("referralLink")?.value; if (!link) return;
  const text = encodeURIComponent("Join SINAPS and start earning SNP!");
  const url = encodeURIComponent(link);
  const share = `https://t.me/share/url?url=${url}&text=${text}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(share); else window.open(share, "_blank");
}

// ============================================================
// HISTORY / GAME
// ============================================================
async function loadHistory() {
  try {
    const data = await api("/api/history");
    const container = $("historyList"); if (!container) return;
    container.innerHTML = "";
    (data.history || []).forEach(item => {
      const amount = Number(item.amount || 0);
      const row = document.createElement("div"); row.className = "history-row";
      row.innerHTML = `<div><strong>${item.type || "Transaction"}</strong><small>${item.details || ""}</small></div><strong class="${amount >= 0 ? "positive" : "negative"}">${amount >= 0 ? "+" : ""}${formatNumber(amount)}</strong>`;
      container.appendChild(row);
    });
    if (!data.history?.length) container.innerHTML = `<div class="empty-state">No transactions yet.</div>`;
  } catch (e) { console.error("history", e); }
}
function playGame() {
  const result = $("gameResult"); if (!result) return;
  result.textContent = Math.random() > 0.5 ? "🎉 You won! Demo only." : "😅 Try again! Demo only.";
}

// ============================================================
// NAVIGATION / EVENTS
// ============================================================
function showPage(page) {
  state.currentPage = page;
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  document.querySelectorAll(".nav-btn").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  if (page === "boost") loadBoosts();
  if (page === "tasks") loadTasks();
  if (page === "friends") loadFriends();
  if (page === "wallet") { loadWallet(); loadHistory(); }
}

function setupEvents() {
  $("sCoin")?.addEventListener("pointerdown", e => { e.preventDefault(); tap(e); }, { passive: false });
  $("dailyGift")?.addEventListener("click", openDaily);
  $("dailyClose")?.addEventListener("click", closeDaily);
  $("dailyModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeDaily);
  document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.page)));
  $("connectWalletButton")?.addEventListener("click", connectWallet);
  $("disconnectWallet")?.addEventListener("click", disconnectWallet);
  $("withdrawButton")?.addEventListener("click", withdraw);
  $("copyReferral")?.addEventListener("click", copyReferral);
  $("copyReferralLarge")?.addEventListener("click", copyReferral);
  $("shareReferral")?.addEventListener("click", shareReferral);
  $("playGame")?.addEventListener("click", playGame);
}

async function init() {
  setupEvents();
  await initWallet();
  await loadUser();
  startEnergyTimer();
}

document.addEventListener("DOMContentLoaded", init);
