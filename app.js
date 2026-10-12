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
let historyOffset = 0;
let historyHasMore = false;
let historyLoading = false;
let spinClaimedToday = false;
let spinBusy = false;
let balanceRefreshTimer = null;

const $ = id => document.getElementById(id);
const formatNumber = value => Number(value || 0).toLocaleString("en-US");
const telegramUser = () => tg?.initDataUnsafe?.user || null;
const authHeaders = () => ({ "Content-Type": "application/json", "X-Telegram-Init-Data": tg?.initData || "" });

async function api(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
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
    // Cached address is for display only until the authenticated server response arrives.
    state.walletAddress = cached.walletAddress || null;
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
  renderHomeWallet();
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

    // Restore the wallet saved for this Telegram account before TON Connect starts.
    try { await loadWallet(); } catch (_) {}

    if (Number(data.referral_reward || 0) > 0) {
      toast(`Referral activated: +${formatNumber(data.referral_reward)} SNP`);
    }

    // Load secondary pages without blocking the Home screen.
    Promise.allSettled([loadBoosts(), loadDaily(), loadTasks(), loadFriends(), loadSpinStatus()]);
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
function renderHomeWallet() {
  const el = $("homeWalletAddress");
  if (!el) return;
  if (state.walletAddress) {
    el.textContent = `◈ ${shortAddress(state.walletAddress)}`;
    el.classList.add("has-wallet");
    el.title = state.walletAddress;
  } else {
    el.textContent = "◈ Wallet not connected";
    el.classList.remove("has-wallet");
    el.title = "Connect your TON wallet";
  }
}

function renderWallet() {
  const address = $("walletAddress"), disconnect = $("disconnectWallet"), walletStatus = $("walletStatus"),
        connectButton = $("connectWalletButton"), topConnect = $("ton-connect-top");
  // If a wallet is saved in the database but TON Connect has no live session,
  // show its saved address on Home instead of a misleading Connect Wallet button.
  // The address pill itself opens the reconnect modal when signing is needed.
  if (topConnect) topConnect.style.display = state.walletAddress && !tonUI?.wallet?.account?.address ? "none" : "flex";
  if (state.walletAddress) {
    if (address) address.textContent = state.walletAddress;
    if (walletStatus) walletStatus.textContent = tonUI?.wallet?.account?.address ? "TON wallet connected" : "Saved TON wallet";
    if (disconnect) disconnect.style.display = "block";
    if (connectButton) {
      connectButton.style.display = tonUI?.wallet?.account?.address ? "none" : "block";
      connectButton.textContent = "RECONNECT WALLET";
    }
  } else {
    if (address) address.textContent = "Not connected";
    if (walletStatus) walletStatus.textContent = "Connect your TON wallet";
    if (disconnect) disconnect.style.display = "none";
    if (connectButton) {
      connectButton.style.display = "block";
      connectButton.textContent = "CONNECT WALLET";
    }
  }
  renderHomeWallet();
}

function comparableWalletAddress(address) {
  return String(address || "").trim().replace(/\s+/g, "");
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
          if (!savedForCurrentUser || comparableWalletAddress(address) !== comparableWalletAddress(savedForCurrentUser)) {
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

      state.walletAddress = address || state.walletAddress;
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
          await Promise.allSettled([loadFriends(), loadTasks()]);
        } catch (e) {
          console.error("wallet connect", e);
          toast("Wallet connected, but could not be saved");
        }
      } else if (disconnectRequested) {
        try { await api("/api/wallet/disconnect", { method: "POST", body: "{}" }); } catch (_) {}
        state.walletAddress = null;
        saveFastCache();
        renderWallet();
        disconnectRequested = false;
        await loadFriends();
      }
    });

    if (tonUI.connectionRestored) {
      await tonUI.connectionRestored;
    }

    // TON Connect's restoration promise may resolve before its status callback finishes.
    // Reconcile the final SDK session with the wallet saved for this Telegram account.
    const restoredAddress = tonUI.wallet?.account?.address || null;
    if (restoredAddress) {
      const savedAddress = state.walletAddress;
      if (savedAddress && comparableWalletAddress(savedAddress) === comparableWalletAddress(restoredAddress)) {
        state.walletAddress = restoredAddress;
      } else {
        ignoreWalletStatus = true;
        try { await tonUI.disconnect(); } catch (_) {}
      }
    }
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
  saveFastCache();
  renderHomeWallet();
  await loadFriends();
  toast("Wallet disconnected");
  disconnectRequested = false;
}

async function loadWallet() {
  try {
    const data = await api("/api/wallet/get", { method: "POST", body: "{}" });
    const saved = data.wallet_address || null;
    // Database is authoritative for the saved address; TON Connect session is checked separately.
    if (!tonUI?.wallet?.account?.address) state.walletAddress = saved;
    renderWallet();
  } catch (e) {
    console.error("wallet get", e);
    renderWallet();
  }
}

// ============================================================
// WITHDRAW
// ============================================================
function pendingWithdrawalKey() {
  return currentTelegramId ? `sinaps_${currentTelegramId}_pending_withdrawal` : "";
}

function getPendingWithdrawalId() {
  const key = pendingWithdrawalKey();
  if (!key) return "";
  try { return localStorage.getItem(key) || ""; } catch (_) { return ""; }
}

function setPendingWithdrawalId(id) {
  const key = pendingWithdrawalKey();
  if (!key) return;
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch (_) {}
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function verifyWithdrawalWithRetry(withdrawalId, silent = false) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const data = await api("/api/withdraw/verify", {
        method: "POST",
        body: JSON.stringify({ withdrawal_id: withdrawalId })
      });
      const withdrawal = data.withdrawal || {};
      const status = String(withdrawal.status || "");

      if (status === "paid") {
        setPendingWithdrawalId("");
        await loadUser();
        await loadHistory();
        if (!silent) toast("SNP withdrawal completed successfully.");
        return status;
      }

      if (status === "payout_submitted") {
        if (!silent) toast("Fee confirmed. SNP payout was submitted; waiting for blockchain confirmation.");
        return status;
      }

      if (status === "fee_paid_pending_payout" || status === "processing" || status === "fee_submitted") {
        if (!silent) toast("Fee confirmed. SNP payout is pending; do not pay the fee again.");
        return status;
      }

      if (status === "cancelled") {
        setPendingWithdrawalId("");
        await loadUser();
        if (!silent) toast("Withdrawal was cancelled.");
        return status;
      }

      // payment_pending can simply mean the chain indexer has not caught up.
      lastError = new Error("Fee payment is not confirmed yet");
    } catch (error) {
      lastError = error;
      // A not-yet-indexed fee or temporary RPC error is retried. Never cancel
      // a withdrawal just because verification is temporarily unavailable.
      if (error.status === 401 || error.status === 404) break;
    }
    if (attempt < 3) await wait(2500);
  }

  if (!silent) {
    toast("Withdrawal is still pending. Do not pay again; SINAPS will recheck it when you reopen the app.");
  }
  console.warn("Withdrawal verification still pending", withdrawalId, lastError?.message || "");
  return "payment_pending";
}

async function resumePendingWithdrawal() {
  const id = getPendingWithdrawalId();
  if (!id) return;
  await verifyWithdrawalWithRetry(id, true);
}

async function withdraw() {
  const existingPending = getPendingWithdrawalId();
  if (existingPending) {
    toast("Checking your existing withdrawal. Please do not create another one.");
    await verifyWithdrawalWithRetry(existingPending, false);
    return;
  }

  const amount = Number($("withdrawAmount")?.value || 0);
  if (!Number.isInteger(amount) || amount <= 0) return toast("Enter a valid amount");
  if (!state.walletAddress) return toast("Connect your wallet first");
  if (amount > state.balance) return toast("Not enough SNP");
  if (!tonUI) return toast("TON Connect is not ready");

  let withdrawalId = "";
  try {
    const data = await api("/api/withdraw/create", {
      method: "POST",
      body: JSON.stringify({ amount, wallet_address: state.walletAddress })
    });
    withdrawalId = data.withdrawal_id;
    setPendingWithdrawalId(withdrawalId);
    state.balance = Number(data.balance ?? state.balance);
    renderUser();

    try {
      await tonUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: data.treasury_wallet, amount: String(data.fee_nano) }]
      });
      if ($("withdrawAmount")) $("withdrawAmount").value = "";
    } catch (sendError) {
      // Only cancel when TON Connect reports that the user explicitly rejected
      // the transaction. Other errors can be ambiguous, so keep it recoverable.
      const rejected = Number(sendError?.code) === 300 || /reject|cancel by user|user declined/i.test(String(sendError?.message || ""));
      if (rejected) {
        try {
          const cancelled = await api("/api/withdraw/cancel", {
            method: "POST",
            body: JSON.stringify({ withdrawal_id: withdrawalId })
          });
          state.balance = Number(cancelled.balance ?? state.balance);
          setPendingWithdrawalId("");
          renderUser();
          toast("Transaction cancelled. Your SNP balance was restored.");
        } catch (cancelError) {
          console.error("withdraw cancel", cancelError);
          toast("Could not confirm cancellation. Keep this withdrawal pending and do not create another.");
        }
      } else {
        console.error("TON fee send", sendError);
        toast("TON Connect could not confirm the fee. Withdrawal kept pending; do not create another withdrawal.");
      }
      return;
    }

    // Once sendTransaction resolves, never auto-cancel on a delayed indexer/API
    // response: the fee may already be on-chain.
    await verifyWithdrawalWithRetry(withdrawalId, false);
  } catch (error) {
    console.error("withdraw", error);
    if (!withdrawalId) toast(error.message || "Withdrawal creation failed");
  }
}

// ============================================================
// DAILY SPIN
// ============================================================
const SPIN_PRIZES = [10, 20, 30, 50, 100, 200, 500, 1000];

async function loadSpinStatus() {
  try {
    const data = await api("/api/spin/status");
    spinClaimedToday = Boolean(data.claimed_today);
    const button = $("spinNowButton");
    const status = $("spinStatus");
    const dot = $("spinDot");
    if (button) {
      button.disabled = spinClaimedToday;
      button.textContent = spinClaimedToday ? "COME BACK TOMORROW" : "SPIN NOW";
    }
    if (status) status.textContent = spinClaimedToday
      ? `Today's spin is used${Number(data.reward || 0) ? ` · You won ${formatNumber(data.reward)} SNP` : ""}.`
      : "Your daily spin is ready.";
    if (dot) dot.classList.toggle("hidden", spinClaimedToday);
  } catch (error) {
    console.error("spin status", error);
    if ($("spinStatus")) $("spinStatus").textContent = "Could not load spin status. Try again.";
  }
}

function openSpin() {
  $("spinModal")?.classList.add("show");
  loadSpinStatus();
}

function closeSpin() {
  if (spinBusy) return;
  $("spinModal")?.classList.remove("show");
}

async function spinNow() {
  if (spinBusy || spinClaimedToday) return;
  const button = $("spinNowButton");
  const wheel = $("spinWheel");
  spinBusy = true;
  if (button) { button.disabled = true; button.textContent = "SPINNING…"; }
  if ($("spinStatus")) $("spinStatus").textContent = "Good luck!";
  try {
    const data = await api("/api/spin/claim", { method: "POST", body: "{}" });
    const index = Math.max(0, Math.min(7, Number(data.prize_index || 0)));
    if (wheel) {
      wheel.style.transition = "none";
      wheel.style.transform = "rotate(0deg)";
      void wheel.offsetWidth;
      wheel.style.transition = "transform 4.2s cubic-bezier(.12,.72,.12,1)";
      wheel.style.transform = `rotate(${360 * 5 - index * 45}deg)`;
    }
    await new Promise(resolve => setTimeout(resolve, 4300));
    applyUser(data.user);
    spinClaimedToday = true;
    if ($("spinStatus")) $("spinStatus").textContent = `🎉 You won ${formatNumber(data.reward)} SNP! Added to your balance.`;
    if (button) button.textContent = "COME BACK TOMORROW";
    if ($("spinDot")) $("spinDot").classList.add("hidden");
    toast(`+${formatNumber(data.reward)} SNP · Daily Spin`);
    await Promise.allSettled([loadHistoryPage(true), loadSpinStatus()]);
  } catch (error) {
    console.error("spin claim", error);
    toast(error.message || "Spin failed");
    await loadSpinStatus();
  } finally {
    spinBusy = false;
    if (button && !spinClaimedToday) { button.disabled = false; button.textContent = "SPIN NOW"; }
  }
}

// ============================================================
// TASKS
// ============================================================

async function loadTasks() {

  const immediate = $("tasksList");

  if (
    immediate &&
    !immediate.children.length
  ) {
    immediate.innerHTML =
      `<div class="empty-state">Loading tasks...</div>`;
  }

  try {

    const data =
      await api("/api/tasks");

    const container =
      $("tasksList");

    if (!container) return;

    container.innerHTML = "";

    const tasks =
      Array.isArray(data.tasks)
        ? data.tasks
        : [];

    if (!tasks.length) {

      container.innerHTML =
        `<div class="empty-state">
          No tasks available.
        </div>`;

      return;
    }

    tasks.forEach(task => {

      const row =
        document.createElement("div");

      row.className =
        "task-row";

      const completed =
        Boolean(task.completed);

      let buttonText =
        completed
          ? "DONE"
          : "VERIFY";

      if (
        task.id === "twitter"
      ) {
        buttonText =
          completed
            ? "DONE"
            : "FOLLOW";
      }

      if (
        task.id === "like_retweet"
      ) {
        buttonText =
          completed
            ? "DONE"
            : "OPEN";
      }

      if (
        task.id === "connect_wallet"
      ) {
        buttonText =
          completed
            ? "DONE"
            : state.walletAddress
              ? "VERIFY"
              : "CONNECT";
      }

      if (
        task.id === "invite_3" ||
        task.id === "invite_10" ||
        task.id === "invite_15"
      ) {
        buttonText =
          completed
            ? "DONE"
            : "VERIFY";
      }

      row.innerHTML = `
        <div class="task-icon">
          ${task.icon || "🎯"}
        </div>

        <div class="task-info">

          <strong>
            ${task.name}
          </strong>

          <small>
            +${formatNumber(task.reward)} SNP
          </small>

        </div>

        <button
          class="task-button"
          ${completed ? "disabled" : ""}
          data-task-id="${task.id}"
          data-url="${task.url || "#"}"
          data-type="${task.type || ""}"
        >
          ${buttonText}
        </button>
      `;

      container.appendChild(row);

    });

    container
      .querySelectorAll(
        ".task-button:not(:disabled)"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            claimTask(
              button.dataset.taskId,
              button.dataset.url,
              button.dataset.type
            );

          }
        );

      });

  } catch (e) {

    console.error(
      "loadTasks",
      e
    );

    const container =
      $("tasksList");

    if (container) {

      container.innerHTML =
        `<div class="empty-state">
          ${e.message || "Tasks unavailable"}
        </div>`;

    }

  }

}


async function claimTask(
  taskId,
  url,
  type
) {

  /*
   * ==========================================================
   * WALLET TASK
   * ==========================================================
   */

  if (
    taskId === "connect_wallet"
  ) {

    if (!state.walletAddress) {

      if (!tonUI) {

        toast(
          "TON Connect is not ready"
        );

        return;

      }

      try {

        await tonUI.openModal();

      } catch (e) {

        console.error(
          "open wallet",
          e
        );

        toast(
          "Could not open wallet"
        );

      }

      return;

    }

  }


  /*
   * ==========================================================
   * EXTERNAL TASKS
   * ==========================================================
   */

  if (type === "external" && url && url !== "#") {
    openExternal(url);
    toast("X task opened. Automatic verification is not available yet.");
    return;
  }


  /*
   * ==========================================================
   * TELEGRAM TASKS
   * ==========================================================
   */

  if (
    type === "telegram" &&
    url &&
    url !== "#"
  ) {

    try {

      if (
        tg?.openTelegramLink
      ) {

        tg.openTelegramLink(
          url
        );

      } else {

        window.open(
          url,
          "_blank"
        );

      }

    } catch (_) {

      try {

        window.open(
          url,
          "_blank"
        );

      } catch (_) {}

    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1200
        )
    );

  }


  /*
   * ==========================================================
   * REFERRAL TASKS
   * ==========================================================
   */

  if (
    type === "referral"
  ) {

    /*
     * Backend خودش تعداد دوستان
     * را بررسی می‌کند.
     *
     * بنابراین فقط VERIFY را
     * به سرور ارسال می‌کنیم.
     */

  }


  /*
   * ==========================================================
   * VERIFY
   * ==========================================================
   */

  try {

    const data =
      await api(
        "/api/tasks/claim",
        {
          method: "POST",

          body: JSON.stringify({

            task_id:
              taskId,

            wallet_address:
              state.walletAddress || ""

          })

        }
      );


    /*
     * Update balance
     */

    if (
      data.balance !== undefined
    ) {

      state.balance =
        Number(
          data.balance
        );

    }


    renderUser();

    saveFastCache();


    /*
     * Reward message
     */

    toast(
      `+${formatNumber(
        data.reward || 0
      )} SNP`
    );


    /*
     * Refresh tasks
     */

    await loadTasks();


    /*
     * Refresh friends for
     * referral tasks.
     */

    if (
      type === "referral"
    ) {

      await loadFriends();

    }

  } catch (e) {

    console.error(
      "claimTask",
      e
    );

    toast(
      e.message ||
      "Task verification failed"
    );

  }

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
      const createdDate = friend.created_at ? new Date(friend.created_at) : null;
      const dateText = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toLocaleDateString("en-US") : "Date unavailable";
      row.innerHTML = `
        <div class="friend-avatar">${friend.wallet_connected ? "✓" : "👤"}</div>
        <div class="friend-main">
          <strong>${friend.username ? `@${friend.username}` : "SINAPS user"}</strong>
          <small>${dateText} · Balance: ${balance} SNP</small>
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
async function loadHistoryPage(reset = false) {
  if (historyLoading) return;
  const container = $("historyList");
  const moreButton = $("historyLoadMore");
  if (!container) return;
  if (reset) {
    historyOffset = 0;
    historyHasMore = false;
    container.innerHTML = "";
  }
  historyLoading = true;
  if (moreButton) { moreButton.disabled = true; moreButton.textContent = "LOADING…"; }
  try {
    const data = await api(`/api/history?limit=10&offset=${historyOffset}`);
    const rows = Array.isArray(data.history) ? data.history : [];
    rows.forEach(item => {
      const amount = Number(item.amount || 0);
      const row = document.createElement("div");
      row.className = "history-row";
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = String(item.type || "Transaction").replace(/_/g, " ");
      const subtitle = document.createElement("small");
      const detailText = item.details ? String(item.details) : "";
      const date = item.created_at ? new Date(item.created_at) : null;
      const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "";
      subtitle.textContent = [detailText, dateText].filter(Boolean).join(" · ");
      details.append(title, subtitle);
      const value = document.createElement("strong");
      value.className = amount >= 0 ? "positive" : "negative";
      value.textContent = `${amount >= 0 ? "+" : ""}${formatNumber(amount)} SNP`;
      row.append(details, value);
      container.appendChild(row);
    });
    if (reset && rows.length === 0) container.innerHTML = `<div class="empty-state">No transactions yet.</div>`;
    historyOffset = Number(data.next_offset ?? historyOffset + rows.length);
    historyHasMore = Boolean(data.has_more);
    if (moreButton) {
      moreButton.hidden = !historyHasMore;
      moreButton.disabled = false;
      moreButton.textContent = "SHOW 10 MORE";
    }
  } catch (error) {
    console.error("history", error);
    if (reset) container.innerHTML = `<div class="empty-state">Transaction history unavailable.</div>`;
    if (moreButton) { moreButton.disabled = false; moreButton.textContent = "TRY AGAIN"; moreButton.hidden = false; }
  } finally {
    historyLoading = false;
  }
}

async function loadHistory() {
  return loadHistoryPage(true);
}

function playGame() {
  const result = $("gameResult"); if (!result) return;
  result.textContent = Math.random() > 0.5 ? "🎉 You won! Demo only." : "😅 Try again! Demo only.";
}

// ============================================================
// EXTERNAL MARKET LINKS
// ============================================================
const SNP_CHART_URL = "https://www.geckoterminal.com/ton/pools/EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";
const SNP_BUY_URL = "https://app.tonkeeper.com/dapp/https%3A%2F%2Fdedust.io%2Fswap%2FGRAM%2FEQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";

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
async function refreshUserBalance() {
  try {
    const user = telegramUser();
    const data = await api("/api/user", {
      method: "POST",
      body: JSON.stringify({ username: user?.username || "", start_param: tg?.initDataUnsafe?.start_param || "" })
    });
    if (data.user) applyUser(data.user);
  } catch (error) {
    console.warn("balance refresh", error?.message || error);
  }
}

function showPage(page) {
  state.currentPage = page;
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  document.querySelectorAll(".nav-btn").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  if (page === "boost") loadBoosts();
  if (page === "tasks") loadTasks();
  if (page === "friends") loadFriends();
  if (page === "wallet") { loadWallet(); loadHistory(); }
  if (page === "home" || page === "friends") refreshUserBalance();
}

function setupEvents() {
  $("sCoin")?.addEventListener("pointerdown", e => { e.preventDefault(); tap(e); }, { passive: false });
  $("dailyGift")?.addEventListener("click", openDaily);
  $("spinOpenButton")?.addEventListener("click", openSpin);
  $("spinClose")?.addEventListener("click", closeSpin);
  $("spinModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeSpin);
  $("spinNowButton")?.addEventListener("click", spinNow);
  $("historyLoadMore")?.addEventListener("click", () => loadHistoryPage(false));
  $("dailyClose")?.addEventListener("click", closeDaily);
  $("dailyModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeDaily);
  document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.page)));
  $("connectWalletButton")?.addEventListener("click", connectWallet);
  $("homeWalletAddress")?.addEventListener("click", () => {
    if (!tonUI?.wallet?.account?.address) connectWallet();
    else showPage("wallet");
  });
  $("homeWalletAddress")?.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!tonUI?.wallet?.account?.address) connectWallet();
      else showPage("wallet");
    }
  });
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
    await resumePendingWithdrawal();
    clearInterval(balanceRefreshTimer);
    balanceRefreshTimer = setInterval(refreshUserBalance, 30000);
  } catch (e) {
    console.error("SINAPS INIT ERROR", e);
    toast("SINAPS could not start");
  }
}

document.addEventListener("DOMContentLoaded", init);
