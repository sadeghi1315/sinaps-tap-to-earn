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
    const isClaimed = claimed.has(day) && day !== next;
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
  const top = $("walletTop"), address = $("walletAddress"), disconnect = $("disconnectWallet"), walletStatus = $("walletStatus");
  if (state.walletAddress) {
    if (top) { top.textContent = shortAddress(state.walletAddress); top.classList.add("connected"); }
    if (address) address.textContent = state.walletAddress;
    if (walletStatus) walletStatus.textContent = "Wallet connected";
    if (disconnect) disconnect.style.display = "block";
  } else {
    if (top) { top.textContent = "CONNECT WALLET"; top.classList.remove("connected"); }
    if (address) address.textContent = "Not connected";
    if (walletStatus) walletStatus.textContent = "Connect your TON wallet";
    if (disconnect) disconnect.style.display = "none";
  }
}

async function initWallet() {
  try {
    if (!window.TON_CONNECT_UI?.TonConnectUI) return console.error("TON Connect UI missing");
    tonUI = new TON_CONNECT_UI.TonConnectUI({ manifestUrl: TON_MANIFEST });
    tonUI.onStatusChange(async wallet => {
      walletInitialized = true;
      if (wallet?.account?.address) {
        state.walletAddress = wallet.account.address;
        renderWallet();
        try {
          await api("/api/wallet/connect", { method: "POST", body: JSON.stringify({ wallet_address: state.walletAddress }) });
        } catch (e) { toast("Wallet connected locally, but could not be saved"); }
      } else if (walletInitialized) {
        state.walletAddress = null;
        renderWallet();
        try { await api("/api/wallet/disconnect", { method: "POST", body: "{}" }); } catch (_) {}
        if (!disconnectRequested) toast("Wallet disconnected");
        disconnectRequested = false;
      }
    });
  } catch (e) { console.error("TON Connect", e); }
}

async function connectWallet() {
  if (!tonUI) return toast("Wallet is not ready");
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
  toast("Wallet disconnected");
}
async function loadWallet() {
  try {
    const data = await api("/api/wallet/get", { method: "POST", body: "{}" });
    // The real TON Connect status is authoritative. Stored wallet is only a fallback before status arrives.
    if (!walletInitialized && data.wallet_address) state.walletAddress = data.wallet_address;
  } catch (_) {}
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
    const input = $("referralLink"); if (input) input.value = data.referral_link || "";
    if ($("referralCode")) $("referralCode").textContent = data.referral_code || "—";
    if ($("referralFriends")) $("referralFriends").textContent = formatNumber(data.total_friends || 0);
    if ($("referralIncome")) $("referralIncome").textContent = `${formatNumber(data.total_earnings || 0)} SNP`;
    if ($("inviteReward")) $("inviteReward").textContent = `+${formatNumber(data.invite_reward || 100)} SNP`;
    if ($("referralRate")) $("referralRate").textContent = `${Math.round(Number(data.referral_rate || 0.15) * 100)}%`;
    const list = $("friendsList"); if (!list) return;
    list.innerHTML = "";
    if (!data.friends?.length) { list.innerHTML = `<div class="empty-state">No invited friends yet.</div>`; return; }
    data.friends.forEach(friend => {
      const row = document.createElement("div"); row.className = "friend-row";
      row.innerHTML = `<span class="friend-avatar">👤</span><div><strong>${friend.username ? `@${friend.username}` : "SINAPS user"}</strong><small>${new Date(friend.created_at).toLocaleDateString("en-US")}</small></div><b>+100</b>`;
      list.appendChild(row);
    });
  } catch (e) { console.error("friends", e); }
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
  $("walletTop")?.addEventListener("click", () => state.walletAddress ? showPage("wallet") : connectWallet());
  $("connectWalletButton")?.addEventListener("click", connectWallet);
  $("disconnectWallet")?.addEventListener("click", disconnectWallet);
  $("withdrawButton")?.addEventListener("click", withdraw);
  $("copyReferral")?.addEventListener("click", copyReferral);
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
