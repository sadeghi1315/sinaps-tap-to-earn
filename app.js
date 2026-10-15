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

const AD_PRICE_PER_CLICK = 0.001;
const AD_MIN_CLICKS = 100;
const AD_MAX_CLICKS = 100000;
let adsLoading = false;

let withdrawBusy = false;
let currentWithdrawalId = null;
let cancellableWithdrawalsLoading = false;

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
    return await api(path, {
      ...options,
      signal: controller.signal
    });
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

  el._timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
}

function shortAddress(address) {
  if (!address) return "";

  return address.length > 15
    ? `${address.slice(0, 5)}...${address.slice(-5)}`
    : address;
}

function cacheKey(suffix) {
  return currentTelegramId
    ? `sinaps_${currentTelegramId}_${suffix}`
    : "";
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
  state.walletAddress = user.wallet_address || state.walletAddress || null;
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

  if ($("balance")) {
    $("balance").textContent = formatNumber(state.balance);
  }

  if ($("boostBalance")) {
    $("boostBalance").textContent = formatNumber(state.balance);
  }

  renderEnergy();
  renderHomeWallet();
}

async function loadUser() {
  const user = telegramUser();
  currentTelegramId = user?.id ? String(user.id) : "";

  loadFastCache();
  renderUser();

  try {
    const data = await apiWithTimeout("/api/user", {
      method: "POST",
      body: JSON.stringify({
        username: user?.username || "",
        start_param: tg?.initDataUnsafe?.start_param || ""
      })
    }, 10000);

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
  if (state.energy <= 0) {
    toast("No energy");
    return;
  }

  const reward = state.tapPower;

  state.energy -= 1;
  state.balance += reward;
  tapQueue += 1;

  renderUser();
  showTapNumber(event, reward);

  if (!tapTimer) {
    tapTimer = setTimeout(flushTaps, 100);
  }
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
  } finally {
    tapFlushInFlight = false;

    if (tapInFlightBatch || tapQueue > 0) {
      tapTimer = setTimeout(flushTaps, 1000);
    }
  }
}

/* =========================================================
   BOOSTS
========================================================= */

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
    tap: { title: "⚡ Tap Power", icon: "⚡" },
    energy: { title: "🔋 Energy Capacity", icon: "🔋" },
    recharge: { title: "🚀 Energy Recharge", icon: "🚀" }
  };

  boosts.forEach(item => {
    const m = meta[item.type];
    if (!m) return;

    const next = item.next;
    const card = document.createElement("div");
    card.className = "boost-card";

    if (!next) card.classList.add("maxed");

    card.innerHTML = `
      <div class="boost-icon">${m.icon}</div>
      <div class="boost-info">
        <div class="boost-name">${m.title.replace(/^\S+\s/, "")}</div>
        <div class="boost-current">Level ${item.current_level}</div>
        <div class="boost-next">${next ? "Next level available" : "Max level"}</div>
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

/* =========================================================
   DAILY REWARDS
========================================================= */

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

    if (isToday) {
      cell.addEventListener("click", claimDaily);
    }

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
      body: JSON.stringify({})
    });

    if (data.balance !== undefined) {
      state.balance = Number(data.balance);
    }

    renderUser();

    toast(`+${formatNumber(data.reward)} SNP · Day ${data.day}`);
    await loadDaily();
  } catch (e) {
    toast(e.message);
  }
}

function openDaily() {
  $("dailyModal")?.classList.add("show");
  void loadDaily();
}

function closeDaily() {
  $("dailyModal")?.classList.remove("show");
}

/* =========================================================
   WALLET
========================================================= */

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
    if (walletStatus) walletStatus.textContent = "TON wallet connected";
    if (disconnect) disconnect.style.display = "block";
    if (connectButton) connectButton.style.display = "none";
  } else {
    if (address) address.textContent = "Not connected";
    if (walletStatus) walletStatus.textContent = "Connect your TON wallet";
    if (disconnect) disconnect.style.display = "none";
    if (connectButton) connectButton.style.display = "block";
  }

  renderHomeWallet();
}

async function initWallet() {
  try {
    if (!window.TON_CONNECT_UI?.TonConnectUI) {
      console.error("TON Connect UI library is unavailable");
      return;
    }

    tonUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TON_MANIFEST,
      buttonRootId: "ton-connect-top"
    });

    tonUI.onStatusChange(async wallet => {
      const address = wallet?.account?.address || null;

      if (address) {
        state.walletAddress = address;
        renderWallet();

        try {
          await api("/api/wallet/connect", {
            method: "POST",
            body: JSON.stringify({ wallet_address: address })
          });

          await refreshUserAfterWithdrawal();
        } catch (error) {
          console.error("Save connected wallet:", error);
          toast("Could not save wallet connection");
        }
      } else if (!tonUI?.wallet?.account?.address) {
        state.walletAddress = null;
        renderWallet();
      }
    });
  } catch (e) {
    console.error("TON Connect", e);
  }
}

async function connectWallet() {
  if (!tonUI) {
    toast("TON Connect is not ready");
    return;
  }

  try {
    await tonUI.openModal();
  } catch (e) {
    console.error("connectWallet:", e);
    toast("Could not open wallet");
  }
}

async function disconnectWallet() {
  try {
    if (tonUI?.disconnect) {
      await tonUI.disconnect();
    }

    await api("/api/wallet/disconnect", {
      method: "POST",
      body: JSON.stringify({})
    });

    state.walletAddress = null;
    renderWallet();

    toast("Wallet disconnected");
  } catch (e) {
    console.error("disconnectWallet:", e);
    toast(e.message || "Could not disconnect wallet");
  }
}

async function loadWallet() {
  renderWallet();
}

/* =========================================================
   WITHDRAWAL
========================================================= */

function getWithdrawFeedback() {
  const card = document.querySelector(".withdraw-card");
  if (!card) return null;

  let box = $("withdrawFeedback");

  if (!box) {
    box = document.createElement("div");
    box.id = "withdrawFeedback";
    box.style.cssText = [
      "margin-top:14px",
      "padding:12px",
      "border-radius:12px",
      "background:rgba(255,255,255,.05)",
      "color:#fff",
      "font-size:12px",
      "line-height:1.6",
      "overflow-wrap:anywhere"
    ].join(";");

    card.appendChild(box);
  }

  return box;
}

/*
 * Show the user's cancellable requests inside Withdraw SNP.
 * Requires GET /api/withdrawals/cancellable on the backend.
 */
async function loadCancellableWithdrawals() {
  const card = document.querySelector(".withdraw-card");
  if (!card || cancellableWithdrawalsLoading) return;

  let container = $("cancellableWithdrawals");

  if (!container) {
    container = document.createElement("div");
    container.id = "cancellableWithdrawals";
    container.style.cssText =
      "margin-top:14px;display:flex;flex-direction:column;gap:10px";
    card.appendChild(container);
  }

  cancellableWithdrawalsLoading = true;
  container.replaceChildren();

  const loading = document.createElement("small");
  loading.textContent = "Loading pending withdrawals...";
  loading.style.opacity = "0.7";
  container.appendChild(loading);

  try {
    const data = await apiWithTimeout(
      "/api/withdrawals/cancellable",
      {},
      12000
    );

    const withdrawals = Array.isArray(data.withdrawals)
      ? data.withdrawals
      : [];

    container.replaceChildren();

    if (!withdrawals.length) {
      const note = document.createElement("small");
      note.textContent = "No pending withdrawals to cancel.";
      note.style.opacity = "0.65";
      container.appendChild(note);
      return;
    }

    const heading = document.createElement("strong");
    heading.textContent = "Pending withdrawals";
    container.appendChild(heading);

    withdrawals.forEach(withdrawal => {
      const id = String(withdrawal.withdrawal_id || "");
      if (!id) return;

      const row = document.createElement("div");
      row.style.cssText = [
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "gap:10px",
        "padding:10px",
        "border-radius:10px",
        "background:rgba(255,255,255,.05)"
      ].join(";");

      const info = document.createElement("div");
      info.style.cssText = "min-width:0;overflow-wrap:anywhere";

      const amount = document.createElement("strong");
      amount.textContent =
        `${formatNumber(withdrawal.amount)} SNP`;

      const status = document.createElement("small");
      status.textContent = "Awaiting TON fee payment";
      status.style.cssText =
        "display:block;opacity:.7;margin-top:4px";

      const requestId = document.createElement("small");
      requestId.textContent = `ID: ${id}`;
      requestId.style.cssText =
        "display:block;opacity:.5;margin-top:3px";

      info.append(amount, status, requestId);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "CANCEL";
      button.style.cssText = [
        "flex-shrink:0",
        "padding:9px 12px",
        "border:1px solid rgba(255,255,255,.25)",
        "border-radius:8px",
        "background:transparent",
        "color:#fff",
        "font-weight:700"
      ].join(";");

      button.addEventListener("click", async () => {
        const confirmed = window.confirm(
          "Cancel this withdrawal? This is only possible before the TON fee payment is confirmed."
        );

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "CANCELLING...";

        try {
          const result = await apiWithTimeout(
            "/api/withdraw/cancel",
            {
              method: "POST",
              body: JSON.stringify({ withdrawal_id: id })
            },
            20000
          );

          if (result.balance !== undefined) {
            state.balance = Number(result.balance);
            renderUser();
            saveFastCache();
          } else {
            await refreshUserAfterWithdrawal();
          }

          if (currentWithdrawalId === id) {
            currentWithdrawalId = null;
          }

          showWithdrawFeedback(
            "Withdrawal cancelled. Your reserved SNP has been returned."
          );

          toast("Withdrawal cancelled; SNP refunded");

          await Promise.allSettled([
            refreshUserAfterWithdrawal(),
            loadHistory()
          ]);

          await loadCancellableWithdrawals();
        } catch (error) {
          console.error("Cancel pending withdrawal:", error);

          toast(error.message || "Could not cancel withdrawal");

          button.disabled = false;
          button.textContent = "CANCEL";

          if (error.status === 400) {
            await loadCancellableWithdrawals();
          }
        }
      });

      row.append(info, button);
      container.appendChild(row);
    });

    if (!container.querySelector(".history-row") &&
        !container.querySelector("strong")) {
      const note = document.createElement("small");
      note.textContent = "No cancellable requests found.";
      note.style.opacity = "0.65";
      container.appendChild(note);
    }
  } catch (error) {
    console.error("loadCancellableWithdrawals:", error);

    container.replaceChildren();

    const note = document.createElement("small");
    note.textContent =
      error.status === 404
        ? "The cancellable-withdrawals endpoint is missing from the backend."
        : "Could not load pending withdrawals. Reopen Wallet to retry.";
    note.style.cssText = "opacity:.7;overflow-wrap:anywhere";
    container.appendChild(note);
  } finally {
    cancellableWithdrawalsLoading = false;
  }
}

function showWithdrawFeedback(message, withdrawalId = null) {
  const box = getWithdrawFeedback();

  if (!box) {
    toast(message);
    return;
  }

  box.replaceChildren();

  const text = document.createElement("p");
  text.textContent = message;
  text.style.margin = "0 0 10px";
  box.appendChild(text);

  if (!withdrawalId) return;

  const idText = document.createElement("small");
  idText.textContent = `Request ID: ${withdrawalId}`;
  idText.style.cssText = "display:block;opacity:.7;margin-bottom:10px";
  box.appendChild(idText);

  const verifyButton = document.createElement("button");
  verifyButton.type = "button";
  verifyButton.textContent = "VERIFY STATUS";
  verifyButton.style.cssText =
    "padding:10px 12px;margin:0 8px 6px 0;border:0;border-radius:8px;background:#43c9ff;color:#00101c;font-weight:800";

  verifyButton.addEventListener("click", () => {
    void verifyWithdrawal(withdrawalId);
  });

  box.appendChild(verifyButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "CANCEL REQUEST";
  cancelButton.style.cssText =
    "padding:10px 12px;margin:0 0 6px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:transparent;color:#fff;font-weight:700";

  cancelButton.addEventListener("click", () => {
    void cancelWithdrawal(withdrawalId);
  });

  box.appendChild(cancelButton);
}

function getActiveWalletAddress() {
  return tonUI?.wallet?.account?.address || null;
}

async function handleWithdraw() {
  if (withdrawBusy) return;

  const button = $("withdrawButton");
  const amountInput = $("withdrawAmount");
  const amount = Number(amountInput?.value || 0);
  const walletAddress = getActiveWalletAddress();

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    toast("Enter a valid whole-number SNP amount");
    amountInput?.focus();
    return;
  }

  if (!tonUI) {
    toast("TON Connect is not ready. Please reopen the app.");
    return;
  }

  if (!walletAddress) {
    toast("Connect your TON wallet first");
    return;
  }

  if (amount > state.balance) {
    toast("Not enough SNP");
    return;
  }

  withdrawBusy = true;

  if (button) {
    button.disabled = true;
    button.textContent = "PROCESSING...";
  }

  try {
    showWithdrawFeedback("Creating your withdrawal request...");

    const created = await apiWithTimeout(
      "/api/withdraw/create",
      {
        method: "POST",
        body: JSON.stringify({
          amount,
          wallet_address: walletAddress
        })
      },
      20000
    );

    if (!created.ok || !created.withdrawal_id) {
      throw new Error(
        created.error || "Could not create withdrawal request"
      );
    }

    const withdrawalId = String(created.withdrawal_id);
    currentWithdrawalId = withdrawalId;

    if (created.balance !== undefined) {
      state.balance = Number(created.balance);
      renderUser();
      saveFastCache();
    } else {
      await refreshUserAfterWithdrawal();
    }

    await Promise.allSettled([
      loadHistory(),
      loadCancellableWithdrawals()
    ]);

    showWithdrawFeedback(
      "Withdrawal request created. The 0.1 TON fee must be sent from your connected wallet. Your SNP remains reserved until the request is cancelled or completed.",
      withdrawalId
    );

    if (!created.treasury_wallet || !created.fee_nano) {
      throw new Error(
        "The request was created, but the fee payment details are missing. Verify the request status before trying again."
      );
    }

    if (typeof tonUI.sendTransaction !== "function") {
      throw new Error(
        "Wallet payment is unavailable. Verify your request status before trying again."
      );
    }

    let paymentResult;

    try {
      paymentResult = await tonUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: created.treasury_wallet,
            amount: String(created.fee_nano)
          }
        ]
      });
    } catch (paymentError) {
      console.error("Withdrawal fee payment:", paymentError);

      showWithdrawFeedback(
        "The wallet did not confirm the fee payment. If you cancelled the wallet prompt, you may verify the request or cancel it if the fee has not been paid.",
        withdrawalId
      );

      toast("TON fee payment was not confirmed");
      return;
    }

    if (!paymentResult) {
      showWithdrawFeedback(
        "The wallet did not return a payment result. Verify the request before attempting another payment.",
        withdrawalId
      );
      return;
    }

    showWithdrawFeedback(
      "Wallet transaction submitted. Checking blockchain confirmation...",
      withdrawalId
    );

    toast("Fee submitted; checking confirmation");

    await new Promise(resolve => setTimeout(resolve, 3000));

    await verifyWithdrawal(withdrawalId);

  } catch (error) {
    console.error("handleWithdraw:", error);

    showWithdrawFeedback(
      error.message || "Withdrawal request failed",
      currentWithdrawalId
    );

    toast(error.message || "Withdrawal failed");
  } finally {
    withdrawBusy = false;

    if (button) {
      button.disabled = false;
      button.textContent = "WITHDRAW";
    }
  }
}

async function verifyWithdrawal(withdrawalId) {
  if (!withdrawalId) {
    toast("Withdrawal request ID is missing");
    return;
  }

  try {
    showWithdrawFeedback(
      "Checking fee payment and withdrawal status...",
      withdrawalId
    );

    const data = await apiWithTimeout(
      "/api/withdraw/verify",
      {
        method: "POST",
        body: JSON.stringify({
          withdrawal_id: withdrawalId
        })
      },
      75000
    );

    const withdrawal = data.withdrawal || {};
    const status = String(withdrawal.status || "");

    const messages = {
      payment_pending:
        "Waiting for confirmation of the 0.1 TON fee. If you have just paid, wait a little and verify again.",
      fee_submitted:
        "Fee payment detected. Your SNP payout is being prepared.",
      fee_paid_pending_payout:
        "Fee received. SNP payout is pending. Verify again later.",
      processing:
        "Your withdrawal is being processed.",
      payout_submitted:
        "SNP payout submitted. Waiting for blockchain confirmation.",
      paid:
        "Withdrawal completed. The SNP payout is confirmed.",
      cancelled:
        "Withdrawal cancelled.",
      failed:
        "Withdrawal failed. Contact support before submitting another request."
    };

    const terminal = ["paid", "cancelled"].includes(status);

    showWithdrawFeedback(
      messages[status] || `Withdrawal status: ${status || "unknown"}`,
      terminal ? null : withdrawalId
    );

    if (terminal) {
      currentWithdrawalId = null;
    }

    await refreshUserAfterWithdrawal();

    await Promise.allSettled([
      loadHistory(),
      loadCancellableWithdrawals()
    ]);

    if (status === "paid") {
      toast("SNP withdrawal confirmed");
    } else if (status === "payment_pending") {
      toast("TON fee is not confirmed yet");
    } else {
      toast(`Withdrawal: ${status.replace(/_/g, " ") || "unknown"}`);
    }

  } catch (error) {
    console.error("verifyWithdrawal:", error);

    showWithdrawFeedback(
      `${error.message || "Could not verify withdrawal"}. Please retry verification.`,
      withdrawalId
    );

    toast(error.message || "Verification failed");
  }
}

async function cancelWithdrawal(withdrawalId) {
  if (!withdrawalId) return;

  const confirmed = window.confirm(
    "Cancel this withdrawal? This is only possible before the fee payment is confirmed."
  );

  if (!confirmed) return;

  try {
    const data = await apiWithTimeout(
      "/api/withdraw/cancel",
      {
        method: "POST",
        body: JSON.stringify({
          withdrawal_id: withdrawalId
        })
      },
      20000
    );

    if (data.balance !== undefined) {
      state.balance = Number(data.balance);
      renderUser();
      saveFastCache();
    }

    currentWithdrawalId = null;

    showWithdrawFeedback(
      "Withdrawal cancelled. Your reserved SNP has been returned."
    );

    await refreshUserAfterWithdrawal();

    await Promise.allSettled([
      loadHistory(),
      loadCancellableWithdrawals()
    ]);

    toast("Withdrawal cancelled; SNP refunded");

  } catch (error) {
    console.error("cancelWithdrawal:", error);

    showWithdrawFeedback(
      `${error.message || "Could not cancel withdrawal"}. If the fee was already paid, cancellation may not be available.`,
      withdrawalId
    );

    toast(error.message || "Cancellation failed");
  }
}

async function refreshUserAfterWithdrawal() {
  try {
    const data = await apiWithTimeout(
      "/api/user",
      {
        method: "POST",
        body: JSON.stringify({})
      },
      12000
    );

    if (data.user) {
      applyUser(data.user);
    }
  } catch (error) {
    console.error("refreshUserAfterWithdrawal:", error);
  }
}

/* =========================================================
   TASKS
========================================================= */

async function loadTasks() {
  const container = $("tasksList");
  if (!container) return;

  try {
    const data = await api("/api/tasks");
    container.innerHTML = "";

    const tasks = Array.isArray(data.tasks) ? data.tasks : [];

    tasks.forEach(task => {
      const row = document.createElement("div");
      row.className = "task-row";

      const completed = Boolean(task.completed);

      const safeName = String(task.name || task.title || "Task");
      row.innerHTML = `
        <div class="task-icon">${task.icon || (task.type === "ad_task" ? "📢" : "🎯")}</div>
        <div class="task-info">
          <strong></strong>
          <small>+${formatNumber(task.reward)} SNP</small>
        </div>
        <button class="task-button" ${completed ? "disabled" : ""} data-task-id="${String(task.id).replace(/"/g, "&quot;")}" data-url="${String(task.url || "#").replace(/"/g, "&quot;")}" data-type="${String(task.type || "").replace(/"/g, "&quot;")}" data-opened="false">
          ${completed ? "DONE" : (task.type === "ad_task" ? "OPEN" : "VERIFY")}
        </button>
      `;
      row.querySelector(".task-info strong").textContent = safeName;
      container.appendChild(row);
    });

    container.querySelectorAll(".task-button:not(:disabled)").forEach(button => {
      button.addEventListener("click", () => {
        const taskId = button.dataset.taskId || "";
        const url = button.dataset.url || "#";
        const type = button.dataset.type || "";
        if (type === "ad_task" && button.dataset.opened !== "true") {
          try {
            const parsed = new URL(url);
            if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Invalid URL");
            if (tg?.openLink) tg.openLink(parsed.href);
            else window.open(parsed.href, "_blank", "noopener,noreferrer");
            // Count one unique link open per user; completion/reward is verified separately.
            void api("/api/ads/click", {
              method: "POST",
              body: JSON.stringify({ task_id: taskId })
            }).then(() => loadAvailableAds()).catch(error => console.warn("Ad click tracking:", error));
            button.dataset.opened = "true";
            button.textContent = "VERIFY +100 SNP";
          } catch (_) {
            toast("Invalid advertising link");
          }
          return;
        }
        claimTask(taskId, url, type);
      });
    });
  } catch (e) {
    console.error("loadTasks:", e);
    container.innerHTML = `<div class="empty-state">Tasks unavailable</div>`;
  }
}

async function claimTask(taskId, url, type) {
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

    toast(`+${formatNumber(data.reward || 0)} SNP`);
    await loadTasks();
  } catch (e) {
    toast(e.message || "Task verification failed");
  }
}

/* =========================================================
   REFERRALS
========================================================= */

async function loadFriends() {
  const list = $("friendsList");
  if (!list) return;

  try {
    const data = await api("/api/friends");

    if ($("referralLink")) {
      $("referralLink").value = data.referral_link || "";
    }

    if ($("referralCode")) {
      $("referralCode").textContent = data.referral_code || "—";
    }

    if ($("referralFriends")) {
      $("referralFriends").textContent = formatNumber(data.total_friends || 0);
    }

    if ($("activeReferrals")) {
      $("activeReferrals").textContent = formatNumber(data.active_referrals || 0);
    }

    if ($("referralIncome")) {
      $("referralIncome").textContent =
        `${formatNumber(data.total_earnings || 0)} SNP`;
    }

    list.innerHTML = "";

    if (!data.friends?.length) {
      list.innerHTML = `<div class="empty-state">No invited friends yet.</div>`;
      return;
    }

    data.friends.forEach(friend => {
      const row = document.createElement("div");
      row.className = "friend-row";

      const avatar = document.createElement("div");
      avatar.className = "friend-avatar";
      avatar.textContent = "✓";

      const main = document.createElement("div");
      main.className = "friend-main";

      const name = document.createElement("strong");
      name.textContent = friend.username
        ? `@${friend.username}`
        : "SINAPS user";

      const balance = document.createElement("small");
      balance.textContent =
        `Balance: ${formatNumber(friend.balance || 0)} SNP`;

      main.append(name, balance);
      row.append(avatar, main);
      list.appendChild(row);
    });
  } catch (e) {
    console.error("loadFriends:", e);
    list.innerHTML = `<div class="empty-state">Referral data unavailable.</div>`;
  }
}

function copyReferral() {
  const input = $("referralLink");
  if (!input?.value) {
    toast("Referral link is not ready");
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(input.value)
      .then(() => toast("Referral link copied"))
      .catch(() => fallbackCopy(input.value));
  } else {
    fallbackCopy(input.value);
  }
}

function fallbackCopy(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();

  try {
    document.execCommand("copy");
    toast("Referral link copied");
  } catch (_) {
    toast("Could not copy referral link");
  }

  input.remove();
}

function shareReferral() {
  const link = $("referralLink")?.value;
  if (!link) return;

  const share =
    `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join SINAPS and start earning SNP!")}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(share);
  } else {
    window.open(share, "_blank", "noopener,noreferrer");
  }
}

/* =========================================================
   SPIN
========================================================= */

async function loadSpinStatus() {
  try {
    const data = await apiWithTimeout("/api/spin/status", {}, 8000);

    spinFreeReady = Boolean(data.free_ready);
    spinTickets = Number(data.tickets || 0);
    spinCount = Number(data.spin_count || 0);

    if ($("spinTicketCount")) {
      $("spinTicketCount").textContent = formatNumber(spinTickets);
    }

    if ($("spinCount")) {
      $("spinCount").textContent = formatNumber(spinCount);
    }

    if ($("spinStatus")) {
      $("spinStatus").textContent = spinFreeReady
        ? "Your free spin is ready."
        : `Tickets available: ${formatNumber(spinTickets)}`;
    }
  } catch (e) {
    console.error("loadSpinStatus:", e);
  }
}

function openSpin() {
  $("spinModal")?.classList.add("show");
  void loadSpinStatus();
}

function closeSpin() {
  $("spinModal")?.classList.remove("show");
}

async function spinNow() {
  if (spinBusy) return;

  spinBusy = true;

  const button = $("spinNowButton");
  if (button) {
    button.disabled = true;
    button.textContent = "SPINNING...";
  }

  try {
    const data = await api("/api/spin/claim", {
      method: "POST",
      body: JSON.stringify({})
    });

    if (data.user) applyUser(data.user);

    if ($("spinStatus")) {
      $("spinStatus").textContent =
        Number(data.reward) > 0
          ? `You won ${formatNumber(data.reward)} SNP!`
          : "No prize this time.";
    }

    toast(
      Number(data.reward) > 0
        ? `+${formatNumber(data.reward)} SNP`
        : "No prize"
    );

    await loadSpinStatus();
  } catch (e) {
    toast(e.message || "Spin failed");
  } finally {
    spinBusy = false;

    if (button) {
      button.disabled = false;
      button.textContent = "SPIN NOW";
    }
  }
}

/* =========================================================
   TRANSACTION HISTORY
========================================================= */

async function loadHistoryPage(reset = false) {
  const container = $("historyList");
  if (!container || historyLoading) return;

  if (reset) {
    historyOffset = 0;
    container.innerHTML = "";
  }

  historyLoading = true;

  try {
    const data = await api(
      `/api/history?limit=10&offset=${historyOffset}`
    );

    const rows = Array.isArray(data.history) ? data.history : [];

    rows.forEach(item => {
      const amount = Number(item.amount || 0);
      const row = document.createElement("div");
      row.className = "history-row";

      const details = document.createElement("div");
      const title = document.createElement("strong");
      const subtitle = document.createElement("small");
      const value = document.createElement("strong");

      title.textContent = String(item.type || "Transaction");
      subtitle.textContent = String(item.details || "");

      value.className = amount >= 0 ? "positive" : "negative";
      value.textContent =
        `${amount >= 0 ? "+" : ""}${formatNumber(amount)} SNP`;

      details.append(title, subtitle);
      row.append(details, value);
      container.appendChild(row);
    });

    historyOffset = Number(
      data.next_offset ?? historyOffset + rows.length
    );

    historyHasMore = rows.length === 10;

    if ($("historyLoadMore")) {
      $("historyLoadMore").hidden = !historyHasMore;
    }
  } catch (e) {
    console.error("loadHistoryPage:", e);
  } finally {
    historyLoading = false;
  }
}

async function loadHistory() {
  return loadHistoryPage(true);
}

/* =========================================================
   SINAPS ADVERTISING MARKETPLACE
========================================================= */

function openCreateAd() {
  const panel = $("createAdPanel");
  if (!panel) {
    toast("Advertising form is not available");
    return;
  }

  panel.hidden = false;
  updateAdCost();

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function closeCreateAd() {
  const panel = $("createAdPanel");
  if (panel) panel.hidden = true;
}

function updateAdCost() {
  const input = $("adClicks");
  const output = $("adEstimatedCost");

  if (!input || !output) return;

  const clicks = Number(input.value || AD_MIN_CLICKS);
  const valid =
    Number.isInteger(clicks) &&
    clicks >= AD_MIN_CLICKS &&
    clicks <= AD_MAX_CLICKS;

  if (!valid) {
    output.textContent =
      `Choose ${AD_MIN_CLICKS}–${formatNumber(AD_MAX_CLICKS)} clicks`;
    return;
  }

  output.textContent =
    `${(clicks * AD_PRICE_PER_CLICK).toFixed(3)} TON`;
}

function switchAdsTab(tab) {
  const available = $("activeAdsList");
  const mine = $("myAdsList");

  document.querySelectorAll("[data-ads-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.adsTab === tab);
  });

  if (available) available.hidden = tab !== "available";
  if (mine) mine.hidden = tab !== "mine";

  if (tab === "available") {
    void loadAvailableAds();
  } else if (tab === "mine") {
    void loadMyAds();
  }
}

function setAdsMessage(container, message) {
  if (!container) return;

  container.replaceChildren();

  const p = document.createElement("p");
  p.className = "ads-empty";
  p.textContent = message;

  container.appendChild(p);
}

function createAdCard(ad, isMine = false) {
  const card = document.createElement("div");
  card.className = "ad-card";

  const title = document.createElement("h4");
  title.textContent = ad.title || "SINAPS Advertisement";
  card.appendChild(title);

  if (ad.description) {
    const description = document.createElement("p");
    description.textContent = ad.description;
    card.appendChild(description);
  }

  const platform = document.createElement("p");
  platform.className = "ad-platform";
  platform.textContent =
    `Platform: ${String(ad.platform || "other").toUpperCase()}`;
  card.appendChild(platform);

  const target = Number(ad.target_clicks || 0);
  const clicks = Number(ad.valid_clicks || 0);

  const progress = document.createElement("p");
  progress.textContent =
    `Completed: ${formatNumber(clicks)} / ${formatNumber(target)}`;
  card.appendChild(progress);

  if (!isMine) {
    const rawClicks = document.createElement("p");
    rawClicks.textContent = `Link clicks: ${formatNumber(ad.click_count || 0)}`;
    card.appendChild(rawClicks);
  }

  if (isMine) {
    const status = document.createElement("p");
    status.className = "ad-status";
    status.textContent =
      `Status: ${String(ad.status || "unknown").replace(/_/g, " ")}`;
    card.appendChild(status);

    const price = document.createElement("p");
    price.textContent =
      `Budget: ${Number(ad.price_gram || 0).toFixed(3)} TON`;
    card.appendChild(price);

    const payment = document.createElement("p");
    payment.className = "ad-payment-status";
    payment.textContent = Number(ad.payment_verified) === 1
      ? "Payment verified"
      : "Awaiting payment verification";
    card.appendChild(payment);

    if (String(ad.status) === "pending_payment" && Number(ad.payment_verified) !== 1) {
      const actions = document.createElement("div");
      actions.className = "ad-card-actions";
      actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px";

      const pay = document.createElement("button");
      pay.type = "button";
      pay.className = "ads-primary-button";
      pay.textContent = "PAY WITH TON";
      pay.addEventListener("click", () => { void payForAd(ad.id); });
      actions.appendChild(pay);

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ads-primary-button";
      cancel.textContent = "CANCEL AD";
      cancel.style.cssText = "background:transparent;border:1px solid rgba(255,255,255,.25);color:#fff";
      cancel.addEventListener("click", () => { void cancelAd(ad.id, cancel); });
      actions.appendChild(cancel);
      card.appendChild(actions);
    }
  } else {
    const note = document.createElement("p");
    note.className = "ad-status";
    note.textContent = "Ad information only — complete this task from the main Tasks list.";
    card.appendChild(note);
  }

  return card;
}

async function loadAvailableAds() {
  const container = $("activeAdsList");
  if (!container || adsLoading) return;

  adsLoading = true;
  setAdsMessage(container, "Loading advertising tasks...");

  try {
    const data = await apiWithTimeout("/api/ads/active", {}, 12000);
    const ads = Array.isArray(data.ads) ? data.ads : [];

    container.replaceChildren();

    if (!ads.length) {
      setAdsMessage(container, "No active ads available yet.");
      return;
    }

    ads.forEach(ad => {
      container.appendChild(createAdCard(ad, false));
    });
  } catch (error) {
    console.error("loadAvailableAds:", error);

    setAdsMessage(
      container,
      error.status === 401 || error.status === 403
        ? "Please reopen SINAPS inside Telegram and try again."
        : "Advertising tasks could not be loaded. Tap the tab to retry."
    );
  } finally {
    adsLoading = false;
  }
}

async function loadMyAds() {
  const container = $("myAdsList");
  if (!container) return;

  setAdsMessage(container, "Loading your ads...");

  try {
    const data = await apiWithTimeout("/api/ads/my", {}, 12000);
    const ads = (Array.isArray(data.ads) ? data.ads : []).filter(ad =>
      !["cancelled", "canceled"].includes(String(ad.status || "").toLowerCase())
    );

    container.replaceChildren();

    if (!ads.length) {
      setAdsMessage(container, "You have not created any ads yet.");
      return;
    }

    ads.forEach(ad => {
      container.appendChild(createAdCard(ad, true));
    });
  } catch (error) {
    console.error("loadMyAds:", error);
    setAdsMessage(container, "Your ads could not be loaded. Tap My Ads to retry.");
  }
}

async function loadAds() {
  await Promise.allSettled([
    loadAvailableAds(),
    loadMyAds()
  ]);
}

let adAdminVerifiedFor = "";

function isTelegramAdPlatform() {
  const value = $("adPlatform")?.value || "channel";
  return value === "channel" || value === "group" || value === "telegram";
}

function setAdAdminStatus(message, state = "") {
  const el = $("adAdminCheckStatus");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-valid", state === "valid");
  el.classList.toggle("is-invalid", state === "invalid");
}

async function checkAdBotAdmin(showToast = true) {
  const platform = $("adPlatform")?.value || "channel";
  const url = $("adUrl")?.value.trim() || "";
  if (!isTelegramAdPlatform()) {
    adAdminVerifiedFor = "";
    setAdAdminStatus("Not required for websites or social media.", "valid");
    return true;
  }
  if (!url) {
    adAdminVerifiedFor = "";
    setAdAdminStatus("Enter the public Telegram channel/group link first.", "invalid");
    if (showToast) toast("Enter the Telegram channel/group link first");
    return false;
  }
  const key = `${platform}|${url}`;
  setAdAdminStatus("Checking whether SINAPS bot is an administrator…");
  const checkButton = $("checkAdAdminButton");
  if (checkButton) { checkButton.disabled = true; checkButton.textContent = "CHECKING…"; }
  try {
    const result = await apiWithTimeout("/api/ads/check-telegram-admin", {
      method: "POST",
      body: JSON.stringify({ platform, target_url: url })
    }, 15000);
    if (!result.ok || !result.is_admin) {
      adAdminVerifiedFor = "";
      setAdAdminStatus(result.error || "SINAPS bot is not an administrator yet. Add it as admin and check again.", "invalid");
      if (showToast) toast(result.error || "Add SINAPS bot as administrator first");
      return false;
    }
    adAdminVerifiedFor = key;
    setAdAdminStatus("✓ SINAPS bot is an administrator. You can continue to payment.", "valid");
    return true;
  } catch (error) {
    adAdminVerifiedFor = "";
    setAdAdminStatus(error.message || "Could not verify bot admin status. Check the public link and try again.", "invalid");
    if (showToast) toast(error.message || "Could not verify bot admin status");
    return false;
  } finally {
    if (checkButton) { checkButton.disabled = false; checkButton.textContent = "CHECK BOT ADMIN STATUS"; }
  }
}

async function createAd() {
  const button = $("createAdButton");

  const title = $("adTitle")?.value.trim() || "";
  const description = $("adDescription")?.value.trim() || "";
  const platformInput = $("adPlatform")?.value || "telegram";
  const targetUrl = $("adUrl")?.value.trim() || "";
  const clicks = Number($("adClicks")?.value);

  if (title.length < 3 || title.length > 100) {
    toast("Title must contain 3–100 characters");
    return;
  }

  if (description.length > 1000) {
    toast("Description is too long");
    return;
  }

  if (
    !Number.isInteger(clicks) ||
    clicks < AD_MIN_CLICKS ||
    clicks > AD_MAX_CLICKS
  ) {
    toast(`Choose ${AD_MIN_CLICKS}–${formatNumber(AD_MAX_CLICKS)} clicks`);
    return;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(targetUrl);

    if (
      !["https:", "http:"].includes(parsedUrl.protocol) ||
      !parsedUrl.hostname.includes(".") ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error("Invalid URL");
    }
  } catch (_) {
    toast("Enter a valid HTTP or HTTPS link");
    return;
  }

  const platform =
    platformInput === "social" ? "other" : platformInput;

  if (isTelegramAdPlatform()) {
    const key = `${platformInput}|${targetUrl}`;
    if (adAdminVerifiedFor !== key) {
      const adminOk = await checkAdBotAdmin(true);
      if (!adminOk) return;
    }
  }

  if (button) {
    button.disabled = true;
    button.textContent = "SUBMITTING...";
  }

  try {
    const data = await apiWithTimeout(
      "/api/ads/create",
      {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          platform,
          target_url: parsedUrl.href,
          target_clicks: clicks
        })
      },
      15000
    );

    if (!data.ok) {
      throw new Error(data.error || "Could not create ad");
    }

    toast("Ad created — awaiting payment verification");
    closeCreateAd();

    if ($("adTitle")) $("adTitle").value = "";
    if ($("adDescription")) $("adDescription").value = "";
    if ($("adUrl")) $("adUrl").value = "";
    if ($("adClicks")) $("adClicks").value = "100";

    updateAdCost();
    await loadMyAds();
    switchAdsTab("mine");
  } catch (error) {
    console.error("createAd:", error);
    toast(error.message || "Could not create advertisement");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "CONTINUE";
    }
  }
}

async function payForAd(adId) {
  if (!tonUI || typeof tonUI.sendTransaction !== "function") {
    toast("TON Connect is not ready. Reopen the app and connect your wallet.");
    return;
  }
  if (!getActiveWalletAddress()) {
    toast("Connect your TON wallet first");
    return;
  }
  try {
    const details = await apiWithTimeout("/api/ads/payment-details", {
      method: "POST",
      body: JSON.stringify({ ad_id: Number(adId) })
    }, 12000);
    if (!details.ok || !details.treasury_wallet || !details.amount_nano) {
      throw new Error(details.error || "Payment details unavailable");
    }
    await tonUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: details.treasury_wallet, amount: String(details.amount_nano) }]
    });
    toast("TON payment sent. Verifying on blockchain...");
    const verified = await apiWithTimeout("/api/ads/verify-payment", {
      method: "POST",
      body: JSON.stringify({ ad_id: Number(adId) })
    }, 20000);
    if (!verified.ok) throw new Error(verified.error || "Payment is not verified yet");
    toast("Payment verified. Your ad task is now live.");
    await Promise.allSettled([loadMyAds(), loadAvailableAds(), loadTasks()]);
  } catch (error) {
    console.error("payForAd:", error);
    toast(error.message || "Payment was not completed. You can retry from My Ads.");
    await loadMyAds();
  }
}

async function cancelAd(adId, button) {
  if (!confirm("Cancel this unpaid advertisement? It will be removed from My Ads.")) return;
  if (button) { button.disabled = true; button.textContent = "CANCELLING..."; }
  try {
    await apiWithTimeout("/api/ads/cancel", {
      method: "POST",
      body: JSON.stringify({ ad_id: Number(adId) })
    }, 12000);
    toast("Advertisement cancelled");
    await loadMyAds();
  } catch (error) {
    toast(error.message || "Could not cancel advertisement");
    if (button) { button.disabled = false; button.textContent = "CANCEL AD"; }
  }
}

async function loadSnpMarketChart() {
  const priceEl = $("snpLivePrice");
  const changeEl = $("snpPriceChange");
  const frameWrap = $("snpChartFrameWrap");
  const statusEl = $("snpChartStatus");
  const marketLink = $("snpMarketLink");
  if (!frameWrap || frameWrap.dataset.loaded === "true") return;
  frameWrap.dataset.loaded = "true";
  try {
    const data = await apiWithTimeout("/api/snp/market", {}, 12000);
    if (data.available && data.pair_address) {
      if (priceEl) priceEl.textContent = data.price_usd ? `$${Number(data.price_usd).toPrecision(6)}` : `${data.price_native || "—"} TON`;
      if (changeEl) {
        const change = Number(data.change_24h || 0);
        changeEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}% (24h)`;
        changeEl.style.color = change >= 0 ? "#48e6a5" : "#ff6b7a";
      }
      const pairUrl = `https://dexscreener.com/ton/${encodeURIComponent(data.pair_address)}?embed=1&theme=dark&trades=0&info=0`;
      const iframe = document.createElement("iframe");
      iframe.src = pairUrl;
      iframe.title = "SINAPS SNP live price chart";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer";
      iframe.allow = "clipboard-read; clipboard-write";
      iframe.style.cssText = "display:block;width:100%;height:360px;border:0;border-radius:14px;background:#070b18";
      frameWrap.replaceChildren(iframe);
      if (marketLink) marketLink.href = data.pair_url || `https://dexscreener.com/ton/${encodeURIComponent(data.pair_address)}`;
      if (statusEl) statusEl.textContent = "Live market data · DexScreener";
    } else {
      if (priceEl) priceEl.textContent = "No live price";
      if (changeEl) changeEl.textContent = "No active liquidity pair found";
      if (statusEl) statusEl.textContent = "SNP needs a supported DEX trading pair with liquidity before a live chart can display.";
      frameWrap.innerHTML = '<div class="snp-chart-empty"><strong>No live chart data yet</strong><span>DexScreener has not returned an active TON trading pair for the configured SNP contract.</span></div>';
      if (marketLink) marketLink.href = "https://dexscreener.com/ton";
    }
  } catch (error) {
    console.error("loadSnpMarketChart:", error);
    frameWrap.dataset.loaded = "false";
    if (statusEl) statusEl.textContent = "Live price service unavailable. Try again shortly.";
  }
}

function setupAdsEvents() {
  $("openCreateAdButton")?.addEventListener("click", openCreateAd);
  $("cancelCreateAdButton")?.addEventListener("click", closeCreateAd);
  $("createAdButton")?.addEventListener("click", createAd);
  $("checkAdAdminButton")?.addEventListener("click", () => { void checkAdBotAdmin(true); });
  $("adPlatform")?.addEventListener("change", () => {
    adAdminVerifiedFor = "";
    if (isTelegramAdPlatform()) setAdAdminStatus("Add SINAPS bot as an administrator, then tap CHECK BOT ADMIN STATUS.");
    else setAdAdminStatus("Not required for websites or social media.", "valid");
  });
  $("adUrl")?.addEventListener("input", () => {
    adAdminVerifiedFor = "";
    if (isTelegramAdPlatform()) setAdAdminStatus("Link changed. Verify bot admin status again.");
  });
  $("adClicks")?.addEventListener("input", updateAdCost);

  document.querySelectorAll("[data-ads-tab]").forEach(button => {
    button.addEventListener("click", () => {
      switchAdsTab(button.dataset.adsTab);
    });
  });

  updateAdCost();
}

/* =========================================================
   NAVIGATION
========================================================= */

function showPage(page) {
  state.currentPage = page;

  document.querySelectorAll(".page").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  document.querySelectorAll(".nav-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  if (page === "boost") {
    void loadBoosts();
  }

  if (page === "game") {
    void loadSnpMarketChart();
  }

  if (page === "tasks") {
    void loadTasks();
    void loadAds();
  }

  if (page === "friends") {
    void loadFriends();
  }

  if (page === "wallet") {
    void loadWallet();
    void loadHistory();
    void loadCancellableWithdrawals();
  }
}

/* =========================================================
   EVENT SETUP
========================================================= */

function setupEvents() {
  $("sCoin")?.addEventListener("pointerdown", event => {
    event.preventDefault();
    tap(event);
  }, { passive: false });

  $("dailyGift")?.addEventListener("click", openDaily);
  $("spinOpenButton")?.addEventListener("click", openSpin);
  $("spinClose")?.addEventListener("click", closeSpin);

  $("spinModal")
    ?.querySelector(".modal-backdrop")
    ?.addEventListener("click", closeSpin);

  $("spinNowButton")?.addEventListener("click", spinNow);
  $("dailyClose")?.addEventListener("click", closeDaily);

  $("dailyModal")
    ?.querySelector(".modal-backdrop")
    ?.addEventListener("click", closeDaily);

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  $("connectWalletButton")?.addEventListener("click", connectWallet);
  $("disconnectWallet")?.addEventListener("click", disconnectWallet);

  $("withdrawButton")?.addEventListener("click", handleWithdraw);

  $("copyReferral")?.addEventListener("click", copyReferral);
  $("copyReferralLarge")?.addEventListener("click", copyReferral);
  $("shareReferral")?.addEventListener("click", shareReferral);

  $("historyLoadMore")?.addEventListener("click", () => {
    if (historyHasMore) {
      void loadHistoryPage(false);
    }
  });

  $("chartButton")?.addEventListener("click", () => {
    const marketUrl = $("snpMarketLink")?.href;
    window.open(marketUrl || "https://dexscreener.com/ton", "_blank", "noopener,noreferrer");
  });

  $("buySnpButton")?.addEventListener("click", () => {
    window.open("https://dedust.io", "_blank", "noopener,noreferrer");
  });

  setupAdsEvents();
}

/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {
  setupEvents();
  loadFastCache();
  renderUser();
  renderWallet();
  startEnergyTimer();

  void initWallet().catch(error => {
    console.error("Wallet init error:", error);
  });

  void loadUser().catch(error => {
    console.error("User init error:", error);
  });

  void loadAds().catch(error => {
    console.error("Advertising initialization error:", error);
  });

  balanceRefreshTimer = setInterval(async () => {
    try {
      const data = await apiWithTimeout(
        "/api/user",
        {
          method: "POST",
          body: JSON.stringify({})
        },
        10000
      );

      if (data.user) {
        applyUser(data.user);
      }
    } catch (error) {
      console.error("User refresh failed:", error);
    }
  }, 30000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  void init();
}
