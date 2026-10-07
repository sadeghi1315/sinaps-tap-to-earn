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
let walletRestoring = false;
let ignoreWalletStatus = false;
let currentTelegramId = "";

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
function cacheKey(suffix) {
  return currentTelegramId ? `sinaps_${currentTelegramId}_${suffix}` : "";
}

function saveFastCache() {
  const key = cacheKey("user");
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      balance: state.balance,
      energy: state.energy,
      maxEnergy: state.maxEnergy,
      tapPower: state.tapPower,
      rechargeMultiplier: state.rechargeMultiplier,
      tapBoostLevel: state.tapBoostLevel,
      energyBoostLevel: state.energyBoostLevel,
      rechargeLevel: state.rechargeLevel,
      walletAddress: state.walletAddress,
      referralCode: state.referralCode
    }));
  } catch (_) {}
}

function loadFastCache() {
  const key = cacheKey("user");
  if (!key) return;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (!cached) return;
    state.balance = Number(cached.balance || 0);
    state.energy = Number(cached.energy || 0);
    state.maxEnergy = Number(cached.maxEnergy || 1000);
    state.tapPower = Number(cached.tapPower || 1);
    state.rechargeMultiplier = Number(cached.rechargeMultiplier || 1);
    state.tapBoostLevel = Number(cached.tapBoostLevel || 1);
    state.energyBoostLevel = Number(cached.energyBoostLevel || 1);
    state.rechargeLevel = Number(cached.rechargeLevel || 1);
    state.referralCode = cached.referralCode || "";
    // Never trust a cached wallet as the active TON connection.
    state.walletAddress = null;
  } catch (_) {}
}

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
  saveFastCache();
  renderUser();
  renderWallet();
}

function renderUser() {
  const user = telegramUser();
  if ($("username")) {
    $("username").textContent = user?.username ? `@${user.username}` : (user?.first_name || "@user");
  }
  if ($("balance")) $("balance").textContent = formatNumber(state.balance);
  if ($("boostBalance")) $("boostBalance").textContent = formatNumber(state.balance);
  renderEnergy();
}

async function loadUser() {
  const user = telegramUser();
  currentTelegramId = user?.id ? String(user.id) : "";

  loadFastCache();
  renderUser();

  try {
    const data = await api("/api/user", {
      method: "POST",
      body: JSON.stringify({
        username: user?.username || "",
        start_param: tg?.initDataUnsafe?.start_param || ""
      })
    });

    applyUser(data.user);

    // مهم:
    // اول آدرس ولت ذخیره‌شده برای همین کاربر را از سرور بگیر
    // تا TON Connect قبل از آن state.walletAddress را null نبیند.
    try {
      await loadWallet();
    } catch (_) {}

    // صفحات فرعی را بعداً بارگذاری کن
    Promise.allSettled([
      loadBoosts(),
      loadDaily(),
      loadTasks(),
      loadFriends()
    ]).catch(() => {});

    return data.user;

  } catch (e) {
    console.error("loadUser", e);

    // حتی اگر API خطا داد، Home را خالی نگذار
    renderUser();
    renderWallet();

    return null;
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
// DAILY
// ============================================================
async function loadDaily() {
  try { renderDaily(await api("/api/daily/status")); }
  catch (e) { console.error("daily", e); }
}

function renderDaily(data) {
  const grid = $("dailyGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const next = Number(data.nextDay || 1);
  const claimed = new Set((data.claimedDays || []).map(Number));
  for (let day = 1; day <= 30; day++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "daily-day";
    const isClaimed = claimed.has(day);
    const isToday = day === next && !data.claimedToday;
    if (isClaimed) cell.classList.add("claimed");
    if (isToday) cell.classList.add("current");
    if (!isToday && !isClaimed) cell.classList.add("locked");
    cell.innerHTML = `<span class="daily-day-number">DAY ${day}</span><strong>${day * 10} SNP</strong><span class="daily-check">${isClaimed ? "✓" : isToday ? "CLAIM" : "🔒"}</span>`;
    if (isToday) cell.addEventListener("click", claimDaily);
    grid.appendChild(cell);
  }
  if ($("dailyDot")) $("dailyDot").classList.toggle("hidden", Boolean(data.claimedToday));
}

async function claimDaily() {
  try {
    const data = await api("/api/daily/claim", { method: "POST", body: "{}" });
    state.balance = Number(data.balance || state.balance);
    renderUser();
    toast(`+${formatNumber(data.reward)} SNP · Day ${data.day}`);
    await loadDaily();
  } catch (e) { toast(e.message); }
}
function openDaily() { $("dailyModal")?.classList.add("show"); loadDaily(); }
function closeDaily() { $("dailyModal")?.classList.remove("show"); }

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

    walletRestoring = true;
    tonUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TON_MANIFEST,
      buttonRootId: "ton-connect-top"
    });

    tonUI.onStatusChange(async wallet => {
      walletInitialized = true;
      const address = wallet?.account?.address || null;

      // TON Connect can restore a wallet from the previous Telegram account.
      // During restoration NEVER attach that wallet to the current user.
      if (walletRestoring) {
        if (address) {
          const savedForCurrentUser = state.walletAddress;
          if (!savedForCurrentUser || address !== savedForCurrentUser) {
            ignoreWalletStatus = true;
            try { await tonUI.disconnect(); } catch (_) {}
            return;
          }
          state.walletAddress = address;
          renderWallet();
        }
        return;
      }

      if (ignoreWalletStatus) {
        ignoreWalletStatus = false;
        return;
      }

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
          console.error("wallet connect", e);
          toast("Wallet connected, but could not be saved");
        }
      } else if (disconnectRequested) {
        try { await api("/api/wallet/disconnect", { method: "POST", body: "{}" }); } catch (_) {}
        disconnectRequested = false;
        await loadFriends();
      }
    });

    if (tonUI.connectionRestored) {
      await tonUI.connectionRestored;
    }

    // Give the restore callback time to finish, then switch to manual mode.
    walletRestoring = false;
    renderWallet();
  } catch (e) {
    walletRestoring = false;
    console.error("TON Connect", e);
  }
}

async function connectWallet() {
  if (!tonUI) return toast("TON Connect is not ready");
  try { await tonUI.openModal(); } catch (e) { console.error(e); toast("Could not open wallet"); }
}

async function disconnectWallet() {
  disconnectRequested = true;
  state.walletAddress = null;
  renderWallet();
  try {
    if (tonUI?.disconnect) await tonUI.disconnect();
  } catch (_) {}
  try { await api("/api/wallet/disconnect", { method: "POST", body: "{}" }); } catch (_) {}
  await loadFriends();
  toast("Wallet disconnected");
  disconnectRequested = false;
}

async function loadWallet() {
  try {
    const data = await api("/api/wallet/get", { method: "POST", body: "{}" });
    const saved = data.wallet_address || null;
    // If TON Connect is already connected, never replace it with the DB value.
    if (!state.walletAddress && saved) state.walletAddress = saved;
    renderWallet();
  } catch (e) {
    console.error("wallet get", e);
    renderWallet();
  }
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
  const immediate = $("tasksList");
  if (immediate && !immediate.children.length) immediate.innerHTML = `<div class="empty-state">Loading tasks...</div>`;
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
  const immediate = $("friendsList");
  if (immediate && !immediate.children.length) immediate.innerHTML = `<div class="empty-state">Loading referrals...</div>`;
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
// EXTERNAL MARKET LINKS
// ============================================================
const SNP_CHART_URL = "https://www.geckoterminal.com/ton/pools/EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";
const SNP_BUY_URL = "https://app.ston.fi/swap?chartVisible=false&ft=GRAM&tt=EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls&fa=%2210%22";

function openExternal(url) {
  try {
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch (_) {}
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (_) {
    window.location.href = url;
  }
}

function openChart() {
  openExternal(SNP_CHART_URL);
}

function openBuySnp() {
  openExternal(SNP_BUY_URL);
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
  $("chartButton")?.addEventListener("click", openChart);
  $("buySnpButton")?.addEventListener("click", openBuySnp);
}

async function init() {
  try {
    setupEvents();

    // IMPORTANT: Telegram identity and cached data are rendered before any
    // network request or TON Connect restoration. This removes the need to tap
    // once before the username/balance appears.
    const user = telegramUser();
    currentTelegramId = user?.id ? String(user.id) : "";
    loadFastCache();
    renderUser();

    await loadUser();
    startEnergyTimer();

    // TON Connect is initialized only after the current Telegram account is
    // known, so a wallet from another account cannot be attached to this user.
    await initWallet();
  } catch (e) {
    console.error("SINAPS INIT ERROR", e);
    toast("SINAPS could not start");
  }
}

document.addEventListener("DOMContentLoaded", init);
