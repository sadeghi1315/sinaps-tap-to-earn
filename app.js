
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
  }, 2400);
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
    if (!window.TON_CONNECT_UI?.TonConnectUI) return;

    tonUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TON_MANIFEST,
      buttonRootId: "ton-connect-top"
    });

    tonUI.onStatusChange(async wallet => {
      const address = wallet?.account?.address || null;
      state.walletAddress = address || state.walletAddress;
      renderWallet();

      if (address) {
        try {
          await api("/api/wallet/connect", {
            method: "POST",
            body: JSON.stringify({ wallet_address: address })
          });
        } catch (_) {}
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
    toast("Could not open wallet");
  }
}

async function disconnectWallet() {
  state.walletAddress = null;
  renderWallet();

  try {
    if (tonUI?.disconnect) {
      await tonUI.disconnect();
    }

    await api("/api/wallet/disconnect", {
      method: "POST",
      body: "{}"
    });
  } catch (_) {}

  toast("Wallet disconnected");
}

async function loadWallet() {
  renderWallet();
}

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

      row.innerHTML = `
        <div class="task-icon">${task.icon || "🎯"}</div>
        <div class="task-info">
          <strong>${task.name}</strong>
          <small>+${formatNumber(task.reward)} SNP</small>
        </div>
        <button class="task-button" ${completed ? "disabled" : ""} data-task-id="${task.id}" data-url="${task.url || "#"}" data-type="${task.type || ""}">
          ${completed ? "DONE" : "VERIFY"}
        </button>
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

    state.balance = Number(data.balance);
    renderUser();

    toast(`+${formatNumber(data.reward || 0)} SNP`);
    await loadTasks();
  } catch (e) {
    toast(e.message || "Task verification failed");
  }
}

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

      row.innerHTML = `
        <div class="friend-avatar">✓</div>
        <div class="friend-main">
          <strong>${friend.username ? `@${friend.username}` : "SINAPS user"}</strong>
          <small>Balance: ${formatNumber(friend.balance || 0)} SNP</small>
        </div>
      `;

      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Referral data unavailable.</div>`;
  }
}

function copyReferral() {
  const input = $("referralLink");
  if (!input?.value) return;

  navigator.clipboard.writeText(input.value)
    .then(() => toast("Referral link copied"))
    .catch(() => toast("Could not copy referral link"));
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
  } catch (_) {}
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
  if (button) button.disabled = true;

  try {
    const data = await api("/api/spin/claim", {
      method: "POST",
      body: "{}"
    });

    if (data.user) applyUser(data.user);

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
    if (button) button.disabled = false;
  }
}

/* =========================================================
   TRANSACTION HISTORY
========================================================= */

async function loadHistoryPage(reset = false) {
  const container = $("historyList");
  if (!container) return;

  if (reset) {
    historyOffset = 0;
    container.innerHTML = "";
  }

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
  } catch (_) {}
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
    output.textContent = `Choose ${AD_MIN_CLICKS}–${formatNumber(AD_MAX_CLICKS)} clicks`;
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
    `Valid clicks: ${formatNumber(clicks)} / ${formatNumber(target)}`;
  card.appendChild(progress);

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

    if (Number(ad.payment_verified) === 1) {
      const paid = document.createElement("p");
      paid.className = "ad-payment-status";
      paid.textContent = "Payment verified";
      card.appendChild(paid);
    } else {
      const pending = document.createElement("p");
      pending.className = "ad-payment-status";
      pending.textContent = "Awaiting payment verification";
      card.appendChild(pending);
    }
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ads-primary-button";
    button.textContent = "OPEN LINK";

    button.addEventListener("click", () => {
      const rawUrl = String(ad.target_url || "");

      try {
        const parsed = new URL(rawUrl);

        if (
          !["https:", "http:"].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password
        ) {
          throw new Error("Invalid URL");
        }

        if (tg?.openLink) {
          tg.openLink(parsed.href);
        } else {
          window.open(parsed.href, "_blank", "noopener,noreferrer");
        }
      } catch (_) {
        toast("Invalid advertising link");
      }
    });

    card.appendChild(button);
  }

  return card;
}

async function loadAvailableAds() {
  const container = $("activeAdsList");
  if (!container) return;

  if (adsLoading) return;

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
    const ads = Array.isArray(data.ads) ? data.ads : [];

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

  // The backend currently accepts telegram, website, youtube,
  // instagram, x and other. Map the UI's social option to other.
  const platform =
    platformInput === "social" ? "other" : platformInput;

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

function setupAdsEvents() {
  $("openCreateAdButton")?.addEventListener("click", openCreateAd);
  $("cancelCreateAdButton")?.addEventListener("click", closeCreateAd);
  $("createAdButton")?.addEventListener("click", createAd);
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
  $("copyReferral")?.addEventListener("click", copyReferral);
  $("copyReferralLarge")?.addEventListener("click", copyReferral);
  $("shareReferral")?.addEventListener("click", shareReferral);

  $("chartButton")?.addEventListener("click", () => {
    window.open("https://geckoterminal.com", "_blank", "noopener,noreferrer");
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

  // Initialize TON Connect independently.
  void initWallet().catch(error => {
    console.error("Wallet init error:", error);
  });

  // Load user data without blocking page initialization.
  void loadUser().catch(error => {
    console.error("User init error:", error);
  });

  // Load ads independently so the Home page is not blocked.
  void loadAds().catch(error => {
    console.error("Advertising initialization error:", error);
  });

  // Refresh user balance periodically.
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
