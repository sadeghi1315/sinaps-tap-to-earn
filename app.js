"use strict";

const tg = window.Telegram?.WebApp || null;

if (tg) {
  tg.ready();
  try {
    tg.setHeaderColor("#02030d");
    tg.setBackgroundColor("#02030d");
  } catch (_) {}
}

const API = "https://sinaps-backend.onrender.com";
const TON_MANIFEST = "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json";

const state = {
  balance: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  rechargeMultiplier: 1,
  tapBoostLevel: 1,
  energyBoostLevel: 1,
  rechargeLevel: 1,
  walletAddress: null,
  username: "",
  referralCode: "",
  currentPage: "home"
};

let tonUI = null;
let tapQueue = 0;
let tapTimer = null;
let tapFlushInFlight = false;
let tapInFlightBatch = null;
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
let spinFreeReady = true;
let spinTickets = 0;
let spinCount = 0;
let spinBusy = false;
let spinNeedsStatusCheck = false;
let balanceRefreshTimer = null;

// Paid advertisements
const AD_PRICE_PER_CLICK = 0.001;
const AD_MIN_CLICKS = 100;
const AD_MAX_CLICKS = 100000;
let adsLoading = false;

const $ = id => document.getElementById(id);
const formatNumber = value => Number(value || 0).toLocaleString("en-US");
const telegramUser = () => tg?.initDataUnsafe?.user || null;
const authHeaders = () => ({
  "Content-Type": "application/json",
  "X-Telegram-Init-Data": tg?.initData || ""
});

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });

  let data = {};
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function apiWithTimeout(path, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await api(path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
  return address.length > 15
    ? `${address.slice(0, 5)}...${address.slice(-5)}`
    : address;
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
    $("username").textContent = user?.username
      ? `@${user.username}`
      : (user?.first_name || "@user");
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

    try {
      await loadWallet();
    } catch (_) {}

    if (Number(data.referral_reward || 0) > 0) {
      toast(`Referral activated: +${formatNumber(data.referral_reward)} SNP`);
    }

    Promise.allSettled([
      loadBoosts(),
      loadDaily(),
      loadTasks(),
      loadFriends(),
      loadSpinStatus()
    ]);

    return data.user;
  } catch (e) {
    console.error("loadUser", e);
    renderUser();
    renderWallet();
    return null;
  }
}

// ============================================================
// ENERGY
// ============================================================

function renderEnergy() {
  const energy = Math.max(
    0,
    Math.min(Number(state.energy || 0), Number(state.maxEnergy || 1000))
  );

  if ($("energy")) {
    $("energy").textContent =
      `${formatNumber(energy)} / ${formatNumber(state.maxEnergy)}`;
  }

  if ($("energyFill")) {
    $("energyFill").style.width =
      `${state.maxEnergy ? (energy / state.maxEnergy) * 100 : 0}%`;
  }
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
  const area = $("tapArea");
  const container = $("floaters");
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
  clearTimeout(tapTimer);
  tapTimer = null;

  if (tapFlushInFlight) return;

  if (!tapInFlightBatch) {
    if (tapQueue <= 0) return;

    const count = Math.min(tapQueue, 50);
    tapQueue -= count;

    const requestId =
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    tapInFlightBatch = {
      count,
      request_id: requestId
    };
  }

  tapFlushInFlight = true;

  try {
    const data = await api("/api/tap", {
      method: "POST",
      body: JSON.stringify(tapInFlightBatch)
    });

    if (data.user) {
      tapInFlightBatch = null;
      applyUser(data.user);

      const pending = tapQueue;

      if (pending > 0) {
        state.balance += pending * state.tapPower;
        state.energy = Math.max(0, state.energy - pending);
      }

      renderUser();
      saveFastCache();
    } else {
      throw new Error("Tap response did not include user data");
    }
  } catch (e) {
    console.error("tap request failed", e);
    toast("Connection issue. Retrying taps…");
  } finally {
    tapFlushInFlight = false;

    if (tapInFlightBatch || tapQueue > 0) {
      tapTimer = setTimeout(flushTaps, 1000);
    }
  }
}

// ============================================================
// BOOSTS
// ============================================================

async function loadBoosts() {
  try {
    const data = await api("/api/boosts");
    renderBoosts(data.boosts || []);

    if ($("boostBalance")) {
      $("boostBalance").textContent = formatNumber(data.balance);
    }
  } catch (e) {
    console.error("boosts", e);
  }
}

function renderBoosts(boosts) {
  const container = $("boostsList");
  if (!container) return;

  container.innerHTML = "";

  const meta = {
    tap: {
      title: "⚡ Tap Power",
      icon: "⚡",
      current: state.tapPower,
      suffix: "SNP per tap"
    },
    energy: {
      title: "🔋 Energy Capacity",
      icon: "🔋",
      current: state.maxEnergy,
      suffix: "maximum energy"
    },
    recharge: {
      title: "🚀 Energy Recharge",
      icon: "🚀",
      current: state.rechargeMultiplier,
      suffix: "× recharge speed"
    }
  };

  boosts.forEach(item => {
    const m = meta[item.type];
    if (!m) return;

    const next = item.next;
    const card = document.createElement("div");
    card.className = "boost-card";

    if (!next) card.classList.add("maxed");

    const currentText =
      item.type === "tap"
        ? `${item.current_level} SNP / tap`
        : item.type === "energy"
          ? `${formatNumber(item.current_level * 1000)} max energy`
          : `${item.current_level}× faster recharge`;

    const nextText = next
      ? item.type === "tap"
        ? `${next.level} SNP / tap`
        : item.type === "energy"
          ? `${formatNumber(next.level * 1000)} max energy`
          : `${next.level}× faster recharge`
      : "Maximum level reached";

    card.innerHTML = `
      <div class="boost-icon">${m.icon}</div>
      <div class="boost-info">
        <div class="boost-name">${m.title.replace(/^\S+\s/, "")}</div>
        <div class="boost-current">Level ${item.current_level} · ${currentText}</div>
        <div class="boost-next">${next ? `Next: ${nextText}` : nextText}</div>
      </div>
      <button class="boost-buy" ${next ? `data-type="${item.type}"` : "disabled"}>
        ${next ? `${formatNumber(next.price)} SNP` : "MAX"}
      </button>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll(".boost-buy[data-type]").forEach(btn => {
    btn.addEventListener("click", () => buyBoost(btn.dataset.type));
  });
}

async function buyBoost(type) {
  try {
    const data = await api("/api/boosts/buy", {
      method: "POST",
      body: JSON.stringify({ type })
    });

    applyUser(data.user);
    toast(data.message || "Boost activated");
    startEnergyTimer();
    await loadBoosts();
  } catch (e) {
    toast(e.message);
  }
}

// ============================================================
// DAILY
// ============================================================

async function loadDaily() {
  try {
    renderDaily(await api("/api/daily/status"));
  } catch (e) {
    console.error("daily", e);
  }
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

    cell.innerHTML = `
      <span class="daily-day-number">DAY ${day}</span>
      <strong>${day * 10} SNP</strong>
      <span class="daily-check">${isClaimed ? "✓" : isToday ? "CLAIM" : "🔒"}</span>
    `;

    if (isToday) cell.addEventListener("click", claimDaily);
    grid.appendChild(cell);
  }

  if ($("dailyDot")) {
    $("dailyDot").classList.toggle("hidden", Boolean(data.claimedToday));
  }
}

async function claimDaily() {
  try {
    const data = await api("/api/daily/claim", {
      method: "POST",
      body: "{}"
    });

    state.balance = Number(data.balance || state.balance);
    renderUser();
    toast(`+${formatNumber(data.reward)} SNP · Day ${data.day}`);
    await loadDaily();
  } catch (e) {
    toast(e.message);
  }
}

function openDaily() {
  $("dailyModal")?.classList.add("show");
  loadDaily();
}

function closeDaily() {
  $("dailyModal")?.classList.remove("show");
}

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
  const address = $("walletAddress");
  const disconnect = $("disconnectWallet");
  const walletStatus = $("walletStatus");
  const connectButton = $("connectWalletButton");
  const topConnect = $("ton-connect-top");

  if (topConnect) {
    topConnect.style.display =
      state.walletAddress && !tonUI?.wallet?.account?.address
        ? "none"
        : "flex";
  }

  if (state.walletAddress) {
    if (address) address.textContent = state.walletAddress;

    if (walletStatus) {
      walletStatus.textContent = tonUI?.wallet?.account?.address
        ? "TON wallet connected"
        : "Saved TON wallet";
    }

    if (disconnect) disconnect.style.display = "block";

    if (connectButton) {
      connectButton.style.display =
        tonUI?.wallet?.account?.address ? "none" : "block";
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

      if (walletRestoring) {
        if (address) {
          const savedForCurrentUser = state.walletAddress;

          if (
            !savedForCurrentUser ||
            comparableWalletAddress(address) !==
              comparableWalletAddress(savedForCurrentUser)
          ) {
            ignoreWalletStatus = true;
            try {
              await tonUI.disconnect();
            } catch (_) {}
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

          try {
            const payout = await api("/api/spin/ton-payout/claim", {
              method: "POST",
              body: JSON.stringify({})
            });

            if (payout?.ok && payout.status === "submitted") {
              toast("Your 0.1 TON spin prize was submitted for payment");
            }
          } catch (payoutError) {
            if (payoutError?.status !== 404) {
              console.warn("spin TON payout check", payoutError);
            }
          }

          await Promise.allSettled([loadFriends(), loadTasks()]);
        } catch (e) {
          console.error("wallet connect", e);
          toast("Wallet connected, but could not be saved");
        }
      } else if (disconnectRequested) {
        try {
          await api("/api/wallet/disconnect", {
            method: "POST",
            body: "{}"
          });
        } catch (_) {}

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

    const restoredAddress = tonUI.wallet?.account?.address || null;

    if (restoredAddress) {
      const savedAddress = state.walletAddress;

      if (
        savedAddress &&
        comparableWalletAddress(savedAddress) ===
          comparableWalletAddress(restoredAddress)
      ) {
        state.walletAddress = restoredAddress;
      } else {
        ignoreWalletStatus = true;
        try {
          await tonUI.disconnect();
        } catch (_) {}
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

  try {
    await tonUI.openModal();
  } catch (e) {
    console.error(e);
    toast("Could not open wallet");
  }
}

async function disconnectWallet() {
  disconnectRequested = true;
  state.walletAddress = null;
  renderWallet();

  try {
    if (tonUI?.disconnect) await tonUI.disconnect();
  } catch (_) {}

  try {
    await api("/api/wallet/disconnect", {
      method: "POST",
      body: "{}"
    });
  } catch (_) {}

  saveFastCache();
  renderHomeWallet();
  await loadFriends();
  toast("Wallet disconnected");
  disconnectRequested = false;
}

async function loadWallet() {
  try {
    const data = await api("/api/wallet/get", {
      method: "POST",
      body: "{}"
    });

    const saved = data.wallet_address || null;

    if (!tonUI?.wallet?.account?.address) {
      state.walletAddress = saved;
    }

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
  return currentTelegramId
    ? `sinaps_${currentTelegramId}_pending_withdrawal`
    : "";
}

function getPendingWithdrawalId() {
  const key = pendingWithdrawalKey();
  if (!key) return "";

  try {
    return localStorage.getItem(key) || "";
  } catch (_) {
    return "";
  }
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
        if (!silent) {
          toast("Fee confirmed. SNP payout was submitted; waiting for blockchain confirmation.");
        }
        return status;
      }

      if (
        status === "fee_paid_pending_payout" ||
        status === "processing" ||
        status === "fee_submitted"
      ) {
        if (!silent) {
          toast("Fee confirmed. SNP payout is pending; do not pay the fee again.");
        }
        return status;
      }

      if (status === "cancelled") {
        setPendingWithdrawalId("");
        await loadUser();

        if (!silent) toast("Withdrawal was cancelled.");
        return status;
      }

      lastError = new Error("Fee payment is not confirmed yet");
    } catch (error) {
      lastError = error;
      if (error.status === 401 || error.status === 404) break;
    }

    if (attempt < 3) await wait(2500);
  }

  if (!silent) {
    toast("Withdrawal is still pending. Do not pay again; SINAPS will recheck it when you reopen the app.");
  }

  console.warn(
    "Withdrawal verification still pending",
    withdrawalId,
    lastError?.message || ""
  );

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

  if (!Number.isInteger(amount) || amount <= 0) {
    return toast("Enter a valid amount");
  }

  if (!state.walletAddress) return toast("Connect your wallet first");
  if (amount > state.balance) return toast("Not enough SNP");
  if (!tonUI) return toast("TON Connect is not ready");

  let withdrawalId = "";

  try {
    const data = await api("/api/withdraw/create", {
      method: "POST",
      body: JSON.stringify({
        amount,
        wallet_address: state.walletAddress
      })
    });

    withdrawalId = data.withdrawal_id;
    setPendingWithdrawalId(withdrawalId);
    state.balance = Number(data.balance ?? state.balance);
    renderUser();

    try {
      await tonUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: data.treasury_wallet,
          amount: String(data.fee_nano)
        }]
      });

      if ($("withdrawAmount")) $("withdrawAmount").value = "";
    } catch (sendError) {
      const rejected =
        Number(sendError?.code) === 300 ||
        /reject|cancel by user|user declined/i.test(
          String(sendError?.message || "")
        );

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

    await verifyWithdrawalWithRetry(withdrawalId, false);
  } catch (error) {
    console.error("withdraw", error);
    if (!withdrawalId) toast(error.message || "Withdrawal creation failed");
  }
}

// ============================================================
// DAILY SPIN
// ============================================================

async function loadSpinStatus() {
  try {
    const data = await apiWithTimeout("/api/spin/status", {}, 10000);

    spinFreeReady = Boolean(data.free_ready);
    spinTickets = Number(data.tickets || 0);
    spinCount = Number(data.spin_count || 0);
    spinClaimedToday = !spinFreeReady;
    spinNeedsStatusCheck = false;

    if ($("spinTicketCount")) {
      $("spinTicketCount").textContent = formatNumber(spinTickets);
    }

    if ($("spinCount")) {
      $("spinCount").textContent = formatNumber(spinCount);
    }

    const button = $("spinNowButton");
    const status = $("spinStatus");
    const dot = $("spinDot");
    const canSpin = spinFreeReady || spinTickets > 0;

    if (button) {
      button.disabled = !canSpin || spinBusy;
      button.textContent = spinBusy
        ? "SPINNING…"
        : spinFreeReady
          ? "FREE SPIN"
          : spinTickets > 0
            ? "USE BONUS TICKET"
            : "NO SPINS AVAILABLE";
    }

    if (status) {
      status.textContent = spinFreeReady
        ? "Your free spin is ready!"
        : spinTickets > 0
          ? `Free spin cooldown active · ${spinTickets} bonus ticket(s) ready.`
          : `Free spin available again ${data.next_free_at ? new Date(data.next_free_at).toLocaleString() : "in 24 hours"}. Invite a friend who connects a TON wallet to earn a ticket.`;
    }

    if (dot) dot.classList.toggle("hidden", !canSpin);
  } catch (error) {
    console.error("spin status", error);

    const button = $("spinNowButton");

    if (spinNeedsStatusCheck && button) {
      button.disabled = false;
      button.textContent = "CHECK RESULT";

      if ($("spinStatus")) {
        $("spinStatus").textContent =
          "We couldn't confirm the last spin. Tap CHECK RESULT to safely refresh its status before trying again.";
      }
    } else if ($("spinStatus")) {
      $("spinStatus").textContent =
        "Could not load spin status. Reopen Spin and try again.";
    }
  }
}

function openSpin() {
  $("spinModal")?.classList.add("show");
  void loadSpinStatus();
}

function closeSpin() {
  if (!spinBusy) $("spinModal")?.classList.remove("show");
}

async function spinNow() {
  if (spinNeedsStatusCheck) {
    void loadSpinStatus();
    return;
  }

  if (spinBusy || (!spinFreeReady && spinTickets <= 0)) return;

  const button = $("spinNowButton");
  const wheel = $("spinWheel");

  spinBusy = true;

  if (button) {
    button.disabled = true;
    button.textContent = "SPINNING…";
  }

  if ($("spinStatus")) {
    $("spinStatus").textContent = "Connecting to SINAPS…";
  }

  let claimAccepted = false;

  try {
    const data = await apiWithTimeout(
      "/api/spin/claim",
      { method: "POST", body: JSON.stringify({}) },
      20000
    );

    claimAccepted = true;

    const sectorCount = 9;
    const rawIndex = Number(data.prize_index);
    const index = Number.isInteger(rawIndex)
      ? Math.max(0, Math.min(sectorCount - 1, rawIndex))
      : 8;

    if (wheel) {
      wheel.style.transition = "none";
      wheel.style.transform = "rotate(0deg)";
      void wheel.offsetWidth;
      wheel.style.transition = "transform 4.8s cubic-bezier(.12,.72,.12,1)";
      wheel.style.transform =
        `rotate(${360 * 6 - index * (360 / sectorCount)}deg)`;
    }

    if ($("spinStatus")) {
      $("spinStatus").textContent = "The result is confirmed. Spinning…";
    }

    await new Promise(resolve => setTimeout(resolve, 4900));

    if (data.user) applyUser(data.user);

    const tonStatus = String(data.ton_payout_status || "pending");

    const tonMessage = tonStatus === "submitted"
      ? "Payout submitted to the TON network; confirmation is pending."
      : tonStatus === "wallet_required"
        ? "Connect your TON wallet to receive this prize."
        : tonStatus === "review_required"
          ? "Payout needs treasury review. Please contact support; do not spin again to retry it."
          : "Payout is queued and will be processed by the treasury.";

    const resultText = data.prize_type === "TON"
      ? `💎 JACKPOT! You won 0.1 TON. ${tonMessage}`
      : Number(data.reward) > 0
        ? `🎉 You won ${formatNumber(data.reward)} SNP! Added to your balance.`
        : "⬜ No prize this time. Good luck on your next spin!";

    if ($("spinStatus")) $("spinStatus").textContent = resultText;

    toast(
      data.prize_type === "TON"
        ? `0.1 TON jackpot · ${tonStatus.replaceAll("_", " ")}`
        : Number(data.reward) > 0
          ? `+${formatNumber(data.reward)} SNP · Spin`
          : "No prize this time"
    );

    void Promise.allSettled([loadHistoryPage(true), loadSpinStatus()]);
  } catch (error) {
    console.error("spin claim", error);

    if (
      !claimAccepted &&
      (!error.status || error.name === "AbortError" || error.name === "TypeError")
    ) {
      spinNeedsStatusCheck = true;

      if ($("spinStatus")) {
        $("spinStatus").textContent =
          "The server response timed out. Checking the result before allowing another spin…";
      }
    } else {
      toast(error.message || "Spin failed");
    }

    void loadSpinStatus();
  } finally {
    spinBusy = false;

    if (button && spinNeedsStatusCheck) {
      button.disabled = false;
      button.textContent = "CHECK RESULT";
    } else if (button) {
      const canSpin = spinFreeReady || spinTickets > 0;
      button.disabled = !canSpin;
      button.textContent = spinFreeReady
        ? "FREE SPIN"
        : spinTickets > 0
          ? "USE BONUS TICKET"
          : "NO SPINS AVAILABLE";
    }

    void loadSpinStatus();
  }
}

// ============================================================
// TASKS
// ============================================================

async function loadTasks() {
  const immediate = $("tasksList");

  if (immediate && !immediate.children.length) {
    immediate.innerHTML = `<div class="empty-state">Loading tasks...</div>`;
  }

  try {
    const data = await api("/api/tasks");
    const container = $("tasksList");

    if (!container) return;

    container.innerHTML = "";

    const tasks = Array.isArray(data.tasks) ? data.tasks : [];

    if (!tasks.length) {
      container.innerHTML = `<div class="empty-state">No tasks available.</div>`;
      return;
    }

    tasks.forEach(task => {
      const row = document.createElement("div");
      row.className = "task-row";

      const completed = Boolean(task.completed);
      let buttonText = completed ? "DONE" : "VERIFY";

      if (task.id === "twitter") buttonText = completed ? "DONE" : "FOLLOW";
      if (task.id === "like_retweet") buttonText = completed ? "DONE" : "OPEN";

      if (task.id === "connect_wallet") {
        buttonText = completed
          ? "DONE"
          : state.walletAddress
            ? "VERIFY"
            : "CONNECT";
      }

      if (["invite_3", "invite_10", "invite_15"].includes(task.id)) {
        buttonText = completed ? "DONE" : "VERIFY";
      }

      row.innerHTML = `
        <div class="task-icon">${task.icon || "🎯"}</div>
        <div class="task-info">
          <strong>${task.name}</strong>
          <small>+${formatNumber(task.reward)} SNP</small>
        </div>
        <button
          class="task-button"
          ${completed ? "disabled" : ""}
          data-task-id="${task.id}"
          data-url="${task.url || "#"}"
          data-type="${task.type || ""}"
        >${buttonText}</button>
      `;

      container.appendChild(row);
    });

    container.querySelectorAll(".task-button:not(:disabled)").forEach(button => {
      button.addEventListener("click", () => {
        claimTask(
          button.dataset.taskId,
          button.dataset.url,
          button.dataset.type
        );
      });
    });
  } catch (e) {
    console.error("loadTasks", e);

    const container = $("tasksList");

    if (container) {
      container.innerHTML = `<div class="empty-state">${e.message || "Tasks unavailable"}</div>`;
    }
  }
}

async function claimTask(taskId, url, type) {
  if (taskId === "connect_wallet") {
    if (!state.walletAddress) {
      if (!tonUI) return toast("TON Connect is not ready");

      try {
        await tonUI.openModal();
      } catch (e) {
        console.error("open wallet", e);
        toast("Could not open wallet");
      }

      return;
    }
  }

  if (type === "external" && url && url !== "#") {
    openExternal(url);
    toast("X task opened. Automatic verification is not available yet.");
    return;
  }

  if (type === "telegram" && url && url !== "#") {
    try {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
      } else {
        window.open(url, "_blank");
      }
    } catch (_) {
      try {
        window.open(url, "_blank");
      } catch (_) {}
    }

    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  try {
    const data = await api("/api/tasks/claim", {
      method: "POST",
      body: JSON.stringify({
        task_id: taskId,
        wallet_address: state.walletAddress || ""
      })
    });

    if (data.balance !== undefined) {
      state.balance = Number(data.balance);
    }

    renderUser();
    saveFastCache();

    toast(`+${formatNumber(data.reward || 0)} SNP`);

    await loadTasks();

    if (type === "referral") {
      await loadFriends();
    }
  } catch (e) {
    console.error("claimTask", e);
    toast(e.message || "Task verification failed");
  }
}

// ============================================================
// SINAPS PAID ADS — Native TON
// ============================================================

function ensureAdsUI() {
  const tasksPage = document.querySelector('.page[data-page="tasks"]');
  if (!tasksPage) return null;

  let root = $("sinapsAdsSection");
  if (root) return root;

  root = document.createElement("section");
  root.id = "sinapsAdsSection";

  root.style.cssText = `
    margin:20px 0;
    padding:16px;
    border:1px solid rgba(130,110,255,.3);
    border-radius:18px;
    background:linear-gradient(145deg,rgba(23,20,55,.96),rgba(5,8,25,.98));
    color:#fff;
  `;

  const style = document.createElement("style");
  style.id = "sinapsAdsStyles";
  style.textContent = `
    #sinapsAdsSection button {
      cursor:pointer;
      border:1px solid rgba(143,126,255,.35);
      border-radius:10px;
      padding:10px 7px;
      color:#fff;
      background:rgba(91,74,190,.22);
      font-weight:700;
      font-size:12px;
    }
    #sinapsAdsSection button:disabled {
      opacity:.5;
      cursor:not-allowed;
    }
    #sinapsAdsSection .ads-tab-active {
      background:linear-gradient(135deg,#7857ff,#4b38ba);
      border-color:#9a87ff;
    }
    #sinapsAdsSection .ads-field {
      width:100%;
      box-sizing:border-box;
      margin:6px 0 12px;
      padding:12px;
      border:1px solid rgba(151,143,211,.35);
      border-radius:10px;
      background:#090d20;
      color:#fff;
      font-size:14px;
      outline:none;
    }
    #sinapsAdsSection .ads-label {
      display:block;
      font-size:12px;
      color:#c5c9e5;
      margin-top:8px;
    }
    #sinapsAdsSection .ads-panel { display:none; }
    #sinapsAdsSection .ads-panel.active { display:block; }
    #sinapsAdsSection .ads-card {
      padding:13px;
      margin:10px 0;
      border-radius:12px;
      background:rgba(255,255,255,.045);
      border:1px solid rgba(255,255,255,.08);
      overflow-wrap:anywhere;
    }
    #sinapsAdsSection .ads-muted {
      color:#aeb5d5;
      font-size:12px;
      line-height:1.6;
    }
    #sinapsAdsSection .ads-price {
      padding:12px;
      margin:10px 0;
      border-radius:10px;
      background:rgba(90,72,190,.18);
      color:#d8ceff;
      font-weight:800;
    }
    #sinapsAdsSection .ads-primary {
      width:100%;
      padding:13px !important;
      background:linear-gradient(135deg,#7958ff,#4c36bc) !important;
      border:0 !important;
    }
  `;

  if (!$("sinapsAdsStyles")) document.head.appendChild(style);

  const heading = document.createElement("div");
  heading.innerHTML = `
    <div style="font-size:19px;font-weight:800">📢 SINAPS Ads</div>
    <div style="font-size:12px;color:#aeb5d5;margin-top:6px">
      Promote your channel, website or social page.
    </div>
  `;

  const tabs = document.createElement("div");
  tabs.style.cssText = `
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:7px;
    margin:16px 0;
  `;

  tabs.innerHTML = `
    <button type="button" id="adsBrowseTab" class="ads-tab-active">Browse Ads</button>
    <button type="button" id="adsMyTab">My Ads</button>
    <button type="button" id="adsCreateTab">Create Ad</button>
  `;

  const browsePanel = document.createElement("div");
  browsePanel.id = "adsBrowsePanel";
  browsePanel.className = "ads-panel active";
  browsePanel.innerHTML = `
    <div class="ads-muted">Active paid advertisements will appear here.</div>
    <div id="activeAdsList">
      <div class="empty-state">Loading ads...</div>
    </div>
  `;

  const myPanel = document.createElement("div");
  myPanel.id = "adsMyPanel";
  myPanel.className = "ads-panel";
  myPanel.innerHTML = `
    <div class="ads-muted">View your advertisements and their status.</div>
    <div id="myAdsList">
      <div class="empty-state">Loading your ads...</div>
    </div>
  `;

  const createPanel = document.createElement("div");
  createPanel.id = "adsCreatePanel";
  createPanel.className = "ads-panel";
  createPanel.innerHTML = `
    <form id="adCreateForm">
      <label class="ads-label" for="adTitle">Advertisement title *</label>
      <input id="adTitle" class="ads-field" type="text" maxlength="100"
        placeholder="e.g. Join my Telegram channel" required>

      <label class="ads-label" for="adPlatform">Platform *</label>
      <select id="adPlatform" class="ads-field" required>
        <option value="telegram">Telegram</option>
        <option value="website">Website</option>
        <option value="x">X / Twitter</option>
        <option value="other">Other</option>
      </select>

      <label class="ads-label" for="adTargetUrl">Destination URL *</label>
      <input id="adTargetUrl" class="ads-field" type="url" maxlength="1000"
        placeholder="https://..." required>

      <label class="ads-label" for="adDescription">Description (optional)</label>
      <textarea id="adDescription" class="ads-field" maxlength="500" rows="3"
        placeholder="Describe your advertisement"></textarea>
function ensureAdsUI() {
const tasksPage = document.querySelector('.page[data-page="tasks"]');
if (!tasksPage) return null;

let root = document.getElementById("sinapsAdsSection");

// Remove duplicate ad sections left by previous HTML/code versions.
tasksPage.querySelectorAll(
'[id="adsSection"], [id="paidAdsSection"], [id="advertisementSection"], [id="sinapsPaidAds"], .duplicate-ads-section'
).forEach(el => {
if (el !== root && !root?.contains(el)) el.remove();
});

// Remove other ad panels outside the working section.
tasksPage.querySelectorAll("section, .ads-section, .paid-ads-section").forEach(el => {
if (el === root || root?.contains(el)) return;

const heading = el.querySelector("h1, h2, h3, h4, strong");
const headingText = (heading?.textContent || "").trim();

if (/SINAPS\s*Ads|Paid\s*Ads|Create\s*Ad/i.test(headingText)) {
  el.remove();
}

});

if (root) {
const tasksList = document.getElementById("tasksList");

// Keep the working ad panel above the regular task list.
if (
  tasksList?.parentNode &&
  root.parentNode === tasksList.parentNode &&
  root.nextElementSibling !== tasksList
) {
  tasksList.parentNode.insertBefore(root, tasksList);
}

return root;

}

root = document.createElement("section");
root.id = "sinapsAdsSection";
root.style.cssText = "margin:20px 0; padding:16px; border:1px solid rgba(130,110,255,.3); border-radius:18px; background:linear-gradient(145deg,rgba(23,20,55,.96),rgba(5,8,25,.98)); color:#fff;";

const style = document.createElement("style");
style.id = "sinapsAdsStyles";
style.textContent = "#sinapsAdsSection button { cursor:pointer; border:1px solid rgba(143,126,255,.35); border-radius:10px; padding:10px 7px; color:#fff; background:rgba(91,74,190,.22); font-weight:700; font-size:12px; } #sinapsAdsSection button:disabled { opacity:.5; cursor:not-allowed; } #sinapsAdsSection .ads-tab-active { background:linear-gradient(135deg,#7857ff,#4b38ba); border-color:#9a87ff; } #sinapsAdsSection .ads-field { width:100%; box-sizing:border-box; margin:6px 0 12px; padding:12px; border:1px solid rgba(151,143,211,.35); border-radius:10px; background:#090d20; color:#fff; font-size:14px; outline:none; } #sinapsAdsSection .ads-label { display:block; font-size:12px; color:#c5c9e5; margin-top:8px; } #sinapsAdsSection .ads-panel { display:none; } #sinapsAdsSection .ads-panel.active { display:block; } #sinapsAdsSection .ads-card { padding:13px; margin:10px 0; border-radius:12px; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08); overflow-wrap:anywhere; } #sinapsAdsSection .ads-muted { color:#aeb5d5; font-size:12px; line-height:1.6; } #sinapsAdsSection .ads-price { padding:12px; margin:10px 0; border-radius:10px; background:rgba(90,72,190,.18); color:#d8ceff; font-weight:800; } #sinapsAdsSection .ads-primary { width:100%; padding:13px !important; background:linear-gradient(135deg,#7958ff,#4c36bc) !important; border:0 !important; }";

if (!document.getElementById("sinapsAdsStyles")) {
document.head.appendChild(style);
}

const heading = document.createElement("div");
heading.innerHTML = "<div style="font-size:19px;font-weight:800">📢 SINAPS Ads</div> <div style="font-size:12px;color:#aeb5d5;margin-top:6px"> Promote your channel, website or social page. </div>";

const tabs = document.createElement("div");
tabs.style.cssText = "display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; margin:16px 0;";
tabs.innerHTML = "<button type="button" id="adsBrowseTab" class="ads-tab-active">Browse Ads</button> <button type="button" id="adsMyTab">My Ads</button> <button type="button" id="adsCreateTab">Create Ad</button>";

const browsePanel = document.createElement("div");
browsePanel.id = "adsBrowsePanel";
browsePanel.className = "ads-panel active";
browsePanel.innerHTML = "<div class="ads-muted">Active paid advertisements will appear here.</div> <div id="activeAdsList"> <div class="empty-state">Loading ads...</div> </div>";

const myPanel = document.createElement("div");
myPanel.id = "adsMyPanel";
myPanel.className = "ads-panel";
myPanel.innerHTML = "<div class="ads-muted">View your advertisements and their status.</div> <div id="myAdsList"> <div class="empty-state">Loading your ads...</div> </div>";

const createPanel = document.createElement("div");
createPanel.id = "adsCreatePanel";
createPanel.className = "ads-panel";
createPanel.innerHTML = `
<form id="adCreateForm">
<label class="ads-label" for="adTitle">Advertisement title *</label>
<input id="adTitle" class="ads-field" type="text" maxlength="100"
placeholder="e.g. Join my Telegram channel" required>

  <label class="ads-label" for="adPlatform">Platform *</label>
  <select id="adPlatform" class="ads-field" required>
    <option value="telegram">Telegram</option>
    <option value="website">Website</option>
    <option value="x">X / Twitter</option>
    <option value="other">Other</option>
  </select>

  <label class="ads-label" for="adTargetUrl">Destination URL *</label>
  <input id="adTargetUrl" class="ads-field" type="url" maxlength="1000"
    placeholder="https://..." required>

  <label class="ads-label" for="adDescription">Description (optional)</label>
  <textarea id="adDescription" class="ads-field" maxlength="500" rows="3"
    placeholder="Describe your advertisement"></textarea>

  <label class="ads-label" for="adTargetClicks">Target clicks (100–100,000)</label>
  <input id="adTargetClicks" class="ads-field" type="number"
    min="100" max="100000" step="100" value="100" required>

  <div id="adPricePreview" class="ads-price">
    Advertising cost: 0.100 TON
  </div>

  <div class="ads-muted">
    Price: 0.001 TON per target click. Native TON only, not SNP.
  </div>

  <button type="submit" id="adCreateButton" class="ads-primary">
    CREATE AD
  </button>

  <div id="adCreateMessage" class="ads-muted" style="margin-top:10px"></div>
</form>

`;

root.append(heading, tabs, browsePanel, myPanel, createPanel);

const tasksList = document.getElementById("tasksList");

if (tasksList?.parentNode) {
tasksList.parentNode.insertBefore(root, tasksList);
} else {
tasksPage.appendChild(root);
}

document.getElementById("adsBrowseTab").addEventListener(
"click", () => showAdsTab("browse")
);
document.getElementById("adsMyTab").addEventListener(
"click", () => showAdsTab("my")
);
document.getElementById("adsCreateTab").addEventListener(
"click", () => showAdsTab("create")
);
document.getElementById("adTargetClicks").addEventListener(
"input", updateAdPrice
);
document.getElementById("adCreateForm").addEventListener(
"submit", async event => {
event.preventDefault();
await createAd();
}
);

updateAdPrice();
return root;
}

function showAdsTab(tab) {
  const tabIds = {
    browse: "adsBrowseTab",
    my: "adsMyTab",
    create: "adsCreateTab"
  };

  const panelIds = {
    browse: "adsBrowsePanel",
    my: "adsMyPanel",
    create: "adsCreatePanel"
  };

  Object.entries(tabIds).forEach(([key, id]) => {
    $(id)?.classList.toggle("ads-tab-active", key === tab);
  });

  Object.entries(panelIds).forEach(([key, id]) => {
    $(id)?.classList.toggle("active", key === tab);
  });

  if (tab === "browse") void loadAds();
  if (tab === "my") void loadMyAds();
}

function updateAdPrice() {
  const input = $("adTargetClicks");
  const preview = $("adPricePreview");
  if (!input || !preview) return;

  const clicks = Number(input.value || AD_MIN_CLICKS);
  const safeClicks = Math.max(
    AD_MIN_CLICKS,
    Math.min(AD_MAX_CLICKS, clicks)
  );

  preview.textContent =
    `Advertising cost: ${(safeClicks * AD_PRICE_PER_CLICK).toFixed(3)} TON`;
}

function adArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.ads)) return data.ads;
  if (Array.isArray(data?.tasks)) return data.tasks;
  if (Array.isArray(data?.active_ads)) return data.active_ads;
  return [];
}

function adPrice(ad) {
  return Number(ad?.price_ton ?? ad?.price_gram ?? ad?.price ?? 0);
}

function adStatusLabel(status) {
  const labels = {
    active: "ACTIVE",
    pending_payment: "AWAITING PAYMENT",
    pending: "PENDING",
    completed: "COMPLETED",
    rejected: "REJECTED",
    cancelled: "CANCELLED",
    paused: "PAUSED"
  };

  return labels[String(status || "").toLowerCase()] ||
    String(status || "UNKNOWN").replace(/_/g, " ").toUpperCase();
}

function makeAdCard(ad, own = false) {
  const card = document.createElement("div");
  card.className = "ads-card";

  const title = document.createElement("strong");
  title.textContent = String(ad.title || "SINAPS Advertisement");

  const description = document.createElement("div");
  description.className = "ads-muted";
  description.style.marginTop = "6px";
  description.textContent = String(ad.description || "");

  const platform = document.createElement("div");
  platform.className = "ads-muted";
  platform.style.marginTop = "7px";
  platform.textContent = `Platform: ${String(ad.platform || "Other")}`;

  const clicks = document.createElement("div");
  clicks.className = "ads-muted";

  const validClicks = Number(ad.valid_clicks ?? ad.completed_clicks ?? 0);
  const targetClicks = Number(ad.target_clicks ?? ad.targetClicks ?? 0);

  clicks.textContent =
    `Clicks: ${formatNumber(validClicks)} / ${formatNumber(targetClicks)}`;

  const price = document.createElement("div");
  price.style.cssText = "font-weight:800;margin-top:8px;color:#d5caff";
  price.textContent = `Budget: ${adPrice(ad).toFixed(3)} TON`;

  const status = document.createElement("div");
  status.className = "ads-muted";
  status.style.marginTop = "5px";
  status.textContent = `Status: ${adStatusLabel(ad.status)}`;

  card.append(title);

  if (description.textContent) card.append(description);

  card.append(platform, clicks, price, status);

  if (own && ad.admin_note) {
    const note = document.createElement("div");
    note.className = "ads-muted";
    note.style.marginTop = "6px";
    note.textContent = `Admin note: ${String(ad.admin_note)}`;
    card.append(note);
  }

  if (!own && ad.status === "active" && ad.target_url) {
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.style.cssText = "width:100%;margin-top:10px";
    openButton.textContent = "OPEN AD";

    openButton.addEventListener("click", () => {
      try {
        const url = new URL(ad.target_url);

        if (!["https:", "http:"].includes(url.protocol)) {
          toast("Invalid advertisement URL");
          return;
        }

        openExternal(url.href);
      } catch (_) {
        toast("Invalid advertisement URL");
      }
    });

    card.append(openButton);
  }

  return card;
}

async function loadAds() {
  ensureAdsUI();

  const container = $("activeAdsList");
  if (!container || adsLoading) return;

  adsLoading = true;
  container.textContent = "Loading advertisements...";

  try {
    const data = await api("/api/ads/active");
    const ads = adArray(data);

    container.replaceChildren();

    if (!ads.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No active advertisements yet.";
      container.append(empty);
      return;
    }

    ads.forEach(ad => container.append(makeAdCard(ad, false)));
  } catch (error) {
    console.error("loadAds", error);
    container.textContent = error.message || "Advertisements are unavailable.";
  } finally {
    adsLoading = false;
  }
}

async function loadMyAds() {
  ensureAdsUI();

  const container = $("myAdsList");
  if (!container) return;

  container.textContent = "Loading your advertisements...";

  try {
    const data = await api("/api/ads/my");
    const ads = adArray(data);

    container.replaceChildren();

    if (!ads.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "You have not created any advertisements.";
      container.append(empty);
      return;
    }

    ads.forEach(ad => container.append(makeAdCard(ad, true)));
  } catch (error) {
    console.error("loadMyAds", error);
    container.textContent = error.message || "Could not load your advertisements.";
  }
}

async function createAd() {
  ensureAdsUI();

  const button = $("adCreateButton");
  const message = $("adCreateMessage");

  if (button?.disabled) return;

  const title = String($("adTitle")?.value || "").trim();
  const platform = String($("adPlatform")?.value || "");
  const targetUrl = String($("adTargetUrl")?.value || "").trim();
  const description = String($("adDescription")?.value || "").trim();
  const clicks = Number($("adTargetClicks")?.value);

  if (!title) return toast("Enter an advertisement title");

  if (!["telegram", "website", "x", "other"].includes(platform)) {
    return toast("Choose a valid platform");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(targetUrl);
  } catch (_) {
    return toast("Enter a valid destination URL");
  }

  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    return toast("Only HTTP and HTTPS links are supported");
  }

  if (
    !Number.isInteger(clicks) ||
    clicks < AD_MIN_CLICKS ||
    clicks > AD_MAX_CLICKS ||
    clicks % 100 !== 0
  ) {
    return toast("Choose clicks in steps of 100, from 100 to 100,000");
  }

  if (!tg?.initData) {
    return toast("Open SINAPS inside Telegram to create an ad");
  }

  const price = clicks * AD_PRICE_PER_CLICK;

  if (!window.confirm(
    `Create this advertisement?\n\n` +
    `Target clicks: ${formatNumber(clicks)}\n` +
    `Cost: ${price.toFixed(3)} TON\n\n` +
    `This creates an ad request only. It does not send TON.`
  )) {
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "CREATING...";
  }

  if (message) message.textContent = "Submitting advertisement...";

  try {
    const data = await api("/api/ads/create", {
      method: "POST",
      body: JSON.stringify({
        title,
        description,
        platform,
        target_url: parsedUrl.href,
        target_clicks: clicks
      })
    });

    const ad = data.ad || data.task || data;

    const returnedPrice = Number(
      ad.price_ton ??
      ad.price_gram ??
      data.price_ton ??
      data.price_gram ??
      price
    );

    if (message) {
      message.textContent =
        `Advertisement created. ID: ${ad.id ?? data.id ?? "—"}. ` +
        `Cost: ${returnedPrice.toFixed(3)} TON. ` +
        `Status: awaiting payment verification.`;
    }

    toast("Advertisement created — payment is still pending");

    // Intentionally do not send TON here.
    // The backend must verify an actual on-chain payment before activation.
    $("adCreateForm")?.reset();

    if ($("adTargetClicks")) $("adTargetClicks").value = "100";

    updateAdPrice();
    await loadMyAds();
    showAdsTab("my");
  } catch (error) {
    console.error("createAd", error);

    if (message) {
      message.textContent = error.message || "Could not create advertisement.";
    }

    toast(error.message || "Could not create advertisement");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "CREATE AD";
    }
  }
}

// ============================================================
// FRIENDS / REFERRAL
// ============================================================

async function loadFriends() {
  const immediate = $("friendsList");

  if (immediate && !immediate.children.length) {
    immediate.innerHTML = `<div class="empty-state">Loading referrals...</div>`;
  }

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
      const reward = friend.referral_rewarded
        ? "REWARDED"
        : friend.wallet_connected
          ? "+100 SNP"
          : "LOCKED";

      const createdDate = friend.created_at ? new Date(friend.created_at) : null;
      const dateText =
        createdDate && !Number.isNaN(createdDate.getTime())
          ? createdDate.toLocaleDateString("en-US")
          : "Date unavailable";

      row.innerHTML = `
        <div class="friend-avatar">${friend.wallet_connected ? "✓" : "👤"}</div>
        <div class="friend-main">
          <strong>${friend.username ? `@${friend.username}` : "SINAPS user"}</strong>
          <small>${dateText} · Balance: ${balance} SNP</small>
          <span class="friend-status ${statusClass}">${status}</span>
        </div>
        <b>${reward}</b>
      `;

      list.appendChild(row);
    });
  } catch (e) {
    console.error("friends", e);

    const list = $("friendsList");
    if (list) list.innerHTML = `<div class="empty-state">Referral data unavailable.</div>`;
  }
}

async function copyReferral() {
  const input = $("referralLink");
  if (!input?.value) return;

  try {
    await navigator.clipboard.writeText(input.value);
    toast("Referral link copied");
  } catch (_) {
    input.select();
    document.execCommand("copy");
    toast("Copied");
  }
}

function shareReferral() {
  const link = $("referralLink")?.value;
  if (!link) return;

  const text = encodeURIComponent("Join SINAPS and start earning SNP!");
  const url = encodeURIComponent(link);
  const share = `https://t.me/share/url?url=${url}&text=${text}`;

  if (tg?.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, "_blank");
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

  if (moreButton) {
    moreButton.disabled = true;
    moreButton.textContent = "LOADING…";
  }

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
      const dateText =
        date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "";

      subtitle.textContent = [detailText, dateText].filter(Boolean).join(" · ");
      details.append(title, subtitle);

      const value = document.createElement("strong");
      value.className = amount >= 0 ? "positive" : "negative";
      value.textContent = `${amount >= 0 ? "+" : ""}${formatNumber(amount)} SNP`;

      row.append(details, value);
      container.appendChild(row);
    });

    if (reset && rows.length === 0) {
      container.innerHTML = `<div class="empty-state">No transactions yet.</div>`;
    }

    historyOffset = Number(data.next_offset ?? historyOffset + rows.length);
    historyHasMore = Boolean(data.has_more);

    if (moreButton) {
      moreButton.hidden = !historyHasMore;
      moreButton.disabled = false;
      moreButton.textContent = "SHOW 10 MORE";
    }
  } catch (error) {
    console.error("history", error);

    if (reset) {
      container.innerHTML =
        `<div class="empty-state">Transaction history unavailable.</div>`;
    }

    if (moreButton) {
      moreButton.disabled = false;
      moreButton.textContent = "TRY AGAIN";
      moreButton.hidden = false;
    }
  } finally {
    historyLoading = false;
  }
}

async function loadHistory() {
  return loadHistoryPage(true);
}

function playGame() {
  const result = $("gameResult");
  if (!result) return;

  result.textContent = Math.random() > 0.5
    ? "🎉 You won! Demo only."
    : "😅 Try again! Demo only.";
}

// ============================================================
// EXTERNAL MARKET LINKS
// ============================================================

const SNP_CHART_URL =
  "https://www.geckoterminal.com/ton/pools/EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";

const SNP_BUY_URL =
  "https://app.tonkeeper.com/dapp/https%3A%2F%2Fdedust.io%2Fswap%2FGRAM%2FEQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";

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
  if (tapQueue > 0 || tapFlushInFlight) return;

  try {
    const user = telegramUser();

    const data = await api("/api/user", {
      method: "POST",
      body: JSON.stringify({
        username: user?.username || "",
        start_param: tg?.initDataUnsafe?.start_param || ""
      })
    });

    if (data.user) applyUser(data.user);
  } catch (error) {
    console.warn("balance refresh", error?.message || error);
  }
}

function showPage(page) {
  state.currentPage = page;

  document.querySelectorAll(".page").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  document.querySelectorAll(".nav-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  if (page === "boost") loadBoosts();

  if (page === "tasks") {
    ensureAdsUI();
    loadTasks();
    loadAds();
  }

  if (page === "friends") loadFriends();

  if (page === "wallet") {
    loadWallet();
    loadHistory();
  }

  if (page === "home" || page === "friends") {
    refreshUserBalance();
  }
}

function setupEvents() {
  $("sCoin")?.addEventListener("pointerdown", e => {
    e.preventDefault();
    tap(e);
  }, { passive: false });

  $("dailyGift")?.addEventListener("click", openDaily);
  $("spinOpenButton")?.addEventListener("click", openSpin);
  $("spinClose")?.addEventListener("click", closeSpin);
  $("spinModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeSpin);
  $("spinNowButton")?.addEventListener("click", spinNow);
  $("historyLoadMore")?.addEventListener("click", () => loadHistoryPage(false));
  $("dailyClose")?.addEventListener("click", closeDaily);
  $("dailyModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeDaily);

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

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

    const user = telegramUser();
    currentTelegramId = user?.id ? String(user.id) : "";

    loadFastCache();
    renderUser();
    startEnergyTimer();

    await loadUser();
    startEnergyTimer();

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
