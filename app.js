
"use strict";

const tg = window.Telegram?.WebApp || null;

if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#050714");
    tg.setBackgroundColor("#050714");
  } catch (_) {}
}

const API = "https://sinaps-backend.onrender.com";
const TON_MANIFEST =
  "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json";

const SNP_CHART_URL =
  "https://www.geckoterminal.com/ton/pools/EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";

const SNP_BUY_URL =
  "https://dedust.io/swap/TON/EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";

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
  username: "SINAPS User",
  referralCode: "",
  currentPage: "home",
  pendingTaps: 0,
  sendingTaps: false,
  lastTapAt: 0,
  dailyClaimed: false
};

let tonUI = null;
let toastTimer = null;
let energyTimer = null;
let tapFlushTimer = null;
let loadingUser = false;

const $ = (selector) => document.querySelector(selector);

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value) {
  return Math.floor(number(value)).toLocaleString("en-US");
}

function telegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

function telegramId() {
  return telegramUser()?.id || null;
}

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
  return headers;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || "GET",
    headers: { ...authHeaders(), ...(options.headers || {}) },
    body: options.body === undefined
      ? undefined
      : JSON.stringify(options.body),
    cache: "no-store"
  });

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = { message: raw };
  }

  if (!response.ok || data.success === false || data.error) {
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`
    );
  }

  return data;
}

function toast(message, duration = 2600) {
  const el = $("#toast");
  if (!el) return;

  el.textContent = String(message || "");
  el.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

function shortAddress(address) {
  if (!address) return "";
  return address.length > 18
    ? `${address.slice(0, 8)}…${address.slice(-6)}`
    : address;
}

function cacheKey() {
  const id = telegramId();
  return id ? `sinaps_v1_state_${id}` : "sinaps_v1_state_guest";
}

function saveFastCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      balance: state.balance,
      energy: state.energy,
      maxEnergy: state.maxEnergy,
      tapPower: state.tapPower,
      rechargeMultiplier: state.rechargeMultiplier,
      tapBoostLevel: state.tapBoostLevel,
      energyBoostLevel: state.energyBoostLevel,
      rechargeLevel: state.rechargeLevel,
      referralCode: state.referralCode
    }));
  } catch (_) {}
}

function loadFastCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey()) || "null");
    if (!saved) return;

    state.balance = number(saved.balance, state.balance);
    state.energy = number(saved.energy, state.energy);
    state.maxEnergy = number(saved.maxEnergy, state.maxEnergy);
    state.tapPower = number(saved.tapPower, state.tapPower);
    state.rechargeMultiplier = number(
      saved.rechargeMultiplier,
      state.rechargeMultiplier
    );
    state.tapBoostLevel = number(saved.tapBoostLevel, state.tapBoostLevel);
    state.energyBoostLevel = number(saved.energyBoostLevel, state.energyBoostLevel);
    state.rechargeLevel = number(saved.rechargeLevel, state.rechargeLevel);
    state.referralCode = saved.referralCode || state.referralCode;
  } catch (_) {}
}

function applyUser(user) {
  if (!user || typeof user !== "object") return;

  state.balance = number(user.balance, state.balance);
  state.energy = number(user.energy, state.energy);
  state.maxEnergy = number(user.max_energy, state.maxEnergy);
  state.tapPower = number(user.tap_power, state.tapPower);
  state.rechargeMultiplier = number(
    user.recharge_multiplier,
    state.rechargeMultiplier
  );
  state.tapBoostLevel = number(user.tap_boost_level, state.tapBoostLevel);
  state.energyBoostLevel = number(user.energy_boost_level, state.energyBoostLevel);
  state.rechargeLevel = number(user.recharge_level, state.rechargeLevel);
  state.referralCode = user.referral_code || state.referralCode;

  // Do not overwrite an active TON Connect wallet with an empty API value.
  if (user.wallet_address) state.walletAddress = user.wallet_address;

  saveFastCache();
  renderHome();
  renderWallet();
}

function renderHome() {
  const balance = $("#balance");
  const energy = $("#energy");
  const maxEnergy = $("#maxEnergy");
  const fill = $("#energyFill");
  const percent = $("#energyPercent");
  const tapPower = $("#tapPower");
  const reward = $("#tapReward");
  const recharge = $("#rechargeRate");
  const boostBalance = $("#boostBalance");

  if (balance) balance.textContent = formatNumber(state.balance);
  if (energy) energy.textContent = formatNumber(state.energy);
  if (maxEnergy) maxEnergy.textContent = formatNumber(state.maxEnergy);
  if (boostBalance) boostBalance.textContent = formatNumber(state.balance);
  if (tapPower) tapPower.textContent = `${formatNumber(state.tapPower)} SNP`;
  if (reward) reward.textContent = `+${formatNumber(state.tapPower)} SNP`;
  if (recharge) recharge.textContent = `${state.rechargeMultiplier}×`;

  const ratio = state.maxEnergy > 0
    ? Math.max(0, Math.min(100, (state.energy / state.maxEnergy) * 100))
    : 0;

  if (fill) fill.style.width = `${ratio}%`;
  if (percent) percent.textContent = `${Math.round(ratio)}%`;

  const name = $("#username");
  if (name && state.username) name.textContent = state.username;
}

function renderWallet() {
  const status = $("#walletStatus");
  const address = $("#walletAddress");
  const connectButton = $("#connectWallet");
  const disconnectButton = $("#disconnectWallet");

  if (state.walletAddress) {
    if (status) status.textContent = "TON wallet connected";
    if (address) address.textContent = state.walletAddress;
    if (connectButton) connectButton.hidden = true;
    if (disconnectButton) disconnectButton.hidden = false;
  } else {
    if (status) status.textContent = "Wallet not connected";
    if (address) address.textContent = "Connect your TON wallet to continue.";
    if (connectButton) connectButton.hidden = false;
    if (disconnectButton) disconnectButton.hidden = true;
  }
}

async function loadUser() {
  if (loadingUser) return;
  loadingUser = true;

  try {
    const user = telegramUser();
    const payload = {
      username: user?.username || user?.first_name || "SINAPS User",
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      start_param: tg?.initDataUnsafe?.start_param || ""
    };

    const data = await api("/api/user", {
      method: "POST",
      body: payload
    });

    applyUser(data.user || data.data?.user || data);
  } catch (error) {
    console.error("Could not load SINAPS user:", error);
    toast("Could not sync account. Please reopen the app to retry.");
  } finally {
    loadingUser = false;
  }

  await Promise.allSettled([
    loadBoosts(),
    loadDailyStatus(),
    loadTasks(),
    loadFriends(),
    loadWallet(),
    loadWithdrawHistory()
  ]);
}

/* ---------------- HOME: TAP + ENERGY ---------------- */

function showFloater(amount, event) {
  const holder = $("#floaters");
  if (!holder) return;

  const floater = document.createElement("span");
  floater.className = "floater";
  floater.textContent = `+${formatNumber(amount)}`;

  const bounds = holder.getBoundingClientRect();
  let x = bounds.width / 2;
  let y = bounds.height / 2;

  if (event && Number.isFinite(event.clientX)) {
    x = event.clientX - bounds.left;
    y = event.clientY - bounds.top;
  }

  floater.style.left = `${Math.max(8, Math.min(bounds.width - 55, x - 18))}px`;
  floater.style.top = `${Math.max(8, Math.min(bounds.height - 30, y - 12))}px`;

  holder.appendChild(floater);
  setTimeout(() => floater.remove(), 850);
}

function tap(event) {
  if (state.energy < 1) {
    toast("Not enough energy. Wait for it to recharge.");
    return;
  }

  const now = Date.now();
  if (now - state.lastTapAt < 45) return;
  state.lastTapAt = now;

  state.energy = Math.max(0, state.energy - 1);
  state.balance += state.tapPower;
  state.pendingTaps += 1;

  renderHome();
  saveFastCache();
  showFloater(state.tapPower, event);

  if (!tapFlushTimer) {
    tapFlushTimer = setTimeout(() => {
      tapFlushTimer = null;
      flushTaps();
    }, 450);
  }

  if (state.pendingTaps >= 20) {
    clearTimeout(tapFlushTimer);
    tapFlushTimer = null;
    flushTaps();
  }
}

async function flushTaps() {
  if (state.sendingTaps || state.pendingTaps <= 0) return;

  state.sendingTaps = true;
  const count = Math.min(50, state.pendingTaps);
  state.pendingTaps -= count;

  try {
    const data = await api("/api/tap", {
      method: "POST",
      body: { count }
    });

    const user = data.user || data.data?.user;
    if (user) {
      applyUser(user);
    } else if (data.balance !== undefined) {
      state.balance = number(data.balance, state.balance);
      if (data.energy !== undefined) state.energy = number(data.energy, state.energy);
      renderHome();
      saveFastCache();
    }
  } catch (error) {
    console.error("Tap sync failed:", error);
    // Restore locally queued taps for a later retry.
    state.pendingTaps += count;
    toast("Tap sync failed. Your taps will retry.");
  } finally {
    state.sendingTaps = false;
    if (state.pendingTaps > 0) {
      clearTimeout(tapFlushTimer);
      tapFlushTimer = setTimeout(() => {
        tapFlushTimer = null;
        flushTaps();
      }, 900);
    }
  }
}

function startEnergyRegen() {
  clearInterval(energyTimer);

  energyTimer = setInterval(() => {
    if (state.energy >= state.maxEnergy) return;

    state.energy = Math.min(
      state.maxEnergy,
      state.energy + Math.max(1, Math.floor(state.rechargeMultiplier))
    );

    renderHome();
  }, 3000);
}

/* ---------------- NAVIGATION ---------------- */

function showPage(page) {
  const validPages = ["home", "boost", "tasks", "friends", "wallet", "game"];
  if (!validPages.includes(page)) page = "home";

  state.currentPage = page;

  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.dataset.page === page);
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === page);
  });

  if (page === "boost") loadBoosts();
  if (page === "tasks") loadTasks();
  if (page === "friends") loadFriends();
  if (page === "wallet") {
    loadWallet();
    loadWithdrawHistory();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- BOOSTS ---------------- */

const boostDefaults = [
  { type: "tap", title: "Tap Power", icon: "⚡", description: "Earn more SNP with every tap." },
  { type: "energy", title: "Energy", icon: "🔋", description: "Increase your maximum energy." },
  { type: "recharge", title: "Recharge", icon: "↻", description: "Restore energy faster." }
];

function boostLevel(type) {
  if (type === "tap") return state.tapBoostLevel;
  if (type === "energy") return state.energyBoostLevel;
  return state.rechargeLevel;
}

function renderBoosts(items) {
  const container = $("#boostsList");
  if (!container) return;

  const boosts = Array.isArray(items) && items.length
    ? items
    : boostDefaults.map((item) => ({
        ...item,
        level: boostLevel(item.type),
        cost: null
      }));

  container.replaceChildren();

  boosts.forEach((boost) => {
    const type = boost.type || boost.id;
    const fallback = boostDefaults.find((item) => item.type === type) || {};
    const title = boost.title || boost.name || fallback.title || "Upgrade";
    const icon = boost.icon || fallback.icon || "✦";
    const level = number(boost.level ?? boost.current_level, boostLevel(type));
    const cost = boost.cost ?? boost.price ?? boost.next_cost;
    const nextValue = boost.next_value ?? boost.nextLevel ?? null;
    const description = boost.description || fallback.description || "Upgrade your SINAPS account.";

    const card = document.createElement("article");
    card.className = "boost-card";

    const iconEl = document.createElement("div");
    iconEl.className = "boost-icon";
    iconEl.textContent = icon;

    const content = document.createElement("div");
    content.className = "boost-content";

    const head = document.createElement("div");
    head.className = "boost-head";

    const titleEl = document.createElement("div");
    titleEl.className = "boost-title";
    titleEl.textContent = title;

    const levelEl = document.createElement("span");
    levelEl.className = "boost-level";
    levelEl.textContent = `LEVEL ${level}`;

    head.append(titleEl, levelEl);

    const desc = document.createElement("div");
    desc.className = "boost-description";
    desc.textContent = description;

    const meta = document.createElement("div");
    meta.className = "boost-meta";

    const currentMeta = document.createElement("span");
    currentMeta.textContent = `Current: Lv. ${level}`;
    meta.appendChild(currentMeta);

    if (nextValue !== null) {
      const nextMeta = document.createElement("span");
      nextMeta.textContent = `Next: ${nextValue}`;
      meta.appendChild(nextMeta);
    }

    content.append(head, desc, meta);

    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "boost-buy";
    buy.dataset.type = type;

    const label = document.createElement("span");
    label.textContent = cost == null
      ? "View upgrade"
      : `Upgrade · ${formatNumber(cost)} SNP`;

    const arrow = document.createElement("span");
    arrow.textContent = "→";
    buy.append(label, arrow);

    if (cost == null && !boost.can_buy && !boost.available) {
      // Keep the card visible if the API omits price details.
      buy.title = "The server will validate the upgrade price.";
    }

    buy.addEventListener("click", () => buyBoost(type, buy));

    card.append(iconEl, content, buy);
    container.appendChild(card);
  });
}

async function loadBoosts() {
  const container = $("#boostsList");
  try {
    const data = await api("/api/boosts");
    const items = data.boosts || data.items || data.data?.boosts || [];
    renderBoosts(items);
  } catch (error) {
    console.error("Could not load boosts:", error);
    if (container && !container.children.length) {
      renderBoosts(null);
    }
  }
}

async function buyBoost(type, button) {
  if (!type) return;

  if (button) button.disabled = true;

  try {
    const data = await api("/api/boosts/buy", {
      method: "POST",
      body: { type }
    });

    if (data.user) applyUser(data.user);
    else if (data.balance !== undefined) {
      state.balance = number(data.balance, state.balance);
      renderHome();
    }

    toast(data.message || "Upgrade request completed.");
    await Promise.allSettled([loadBoosts(), loadUserSummary()]);
  } catch (error) {
    toast(error.message || "Could not purchase this upgrade.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadUserSummary() {
  try {
    const data = await api("/api/user", {
      method: "POST",
      body: {
        username: telegramUser()?.username ||
          telegramUser()?.first_name || "SINAPS User",
        start_param: tg?.initDataUnsafe?.start_param || ""
      }
    });
    applyUser(data.user || data.data?.user || data);
  } catch (_) {}
}

/* ---------------- DAILY REWARD ---------------- */

async function loadDailyStatus() {
  try {
    const data = await api("/api/daily/status");
    const status = data.status || data.daily || data;

    state.dailyClaimed = Boolean(
      status.claimed || status.claimed_today || status.already_claimed
    );

    const claimButton = $("#claimDaily");
    if (claimButton) {
      claimButton.disabled = state.dailyClaimed;
      claimButton.innerHTML = state.dailyClaimed
        ? "<span>Already claimed today</span>"
        : "<span>Claim reward</span><span>→</span>";
    }

    renderDailyGrid(status);
  } catch (error) {
    console.error("Daily status unavailable:", error);
    renderDailyGrid({});
  }
}

function renderDailyGrid(status) {
  const grid = $("#dailyGrid");
  if (!grid) return;

  grid.replaceChildren();

  const streak = number(status.streak ?? status.current_streak, 0);
  const rewards = Array.isArray(status.rewards) ? status.rewards : null;

  for (let day = 1; day <= 7; day++) {
    const reward = rewards?.[day - 1]?.reward ??
      rewards?.[day - 1]?.amount ?? day * 10;

    const item = document.createElement("div");
    item.className = "daily-day";
    if (day <= streak) item.classList.add("claimed");

    const dayLabel = document.createElement("strong");
    dayLabel.textContent = `DAY ${day}`;

    const rewardLabel = document.createElement("span");
    rewardLabel.textContent = `${formatNumber(reward)} SNP`;

    item.append(dayLabel, rewardLabel);
    grid.appendChild(item);
  }
}

function openDailyModal() {
  $("#dailyModal")?.classList.add("open");
  $("#dailyModal")?.setAttribute("aria-hidden", "false");
  loadDailyStatus();
}

function closeDailyModal() {
  $("#dailyModal")?.classList.remove("open");
  $("#dailyModal")?.setAttribute("aria-hidden", "true");
}

async function claimDaily() {
  const button = $("#claimDaily");
  if (button) button.disabled = true;

  try {
    const data = await api("/api/daily/claim", {
      method: "POST",
      body: {}
    });

    if (data.user) applyUser(data.user);
    else if (data.balance !== undefined) {
      state.balance = number(data.balance, state.balance);
      renderHome();
    }

    state.dailyClaimed = true;
    toast(data.message || "Daily reward claimed!");
    await loadDailyStatus();
  } catch (error) {
    toast(error.message || "Could not claim today's reward.");
  } finally {
    if (button) button.disabled = state.dailyClaimed;
  }
}

/* ---------------- TASKS ---------------- */

async function loadTasks() {
  const container = $("#tasksList");
  if (!container) return;

  try {
    const data = await api("/api/tasks");
    const tasks = data.tasks || data.items || data.data?.tasks || [];
    renderTasks(tasks);
  } catch (error) {
    console.error("Could not load tasks:", error);
    if (!container.children.length) {
      container.innerHTML = '<div class="empty-state">Tasks could not be loaded. Please try again.</div>';
    }
  }
}

function renderTasks(tasks) {
  const container = $("#tasksList");
  if (!container) return;

  container.replaceChildren();

  if (!Array.isArray(tasks) || tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No tasks are available right now.";
    container.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    const id = task.id ?? task.task_id;
    const title = task.title || task.name || "SINAPS task";
    const description = task.description || task.details || "Complete this task to earn SNP.";
    const reward = number(task.reward ?? task.reward_amount, 0);
    const completed = Boolean(task.completed || task.done || task.claimed);
    const url = task.url || task.link || "";

    const row = document.createElement("article");
    row.className = "task-row";

    const icon = document.createElement("div");
    icon.className = "task-icon";
    icon.textContent = task.icon || "✦";

    const content = document.createElement("div");
    content.className = "task-content";

    const titleEl = document.createElement("div");
    titleEl.className = "task-title";
    titleEl.textContent = title;

    const desc = document.createElement("div");
    desc.className = "task-description";
    desc.textContent = description;

    const rewardEl = document.createElement("div");
    rewardEl.className = "task-reward";
    rewardEl.textContent = `+${formatNumber(reward)} SNP`;

    content.append(titleEl, desc, rewardEl);

    const action = document.createElement("button");
    action.type = "button";
    action.className = `task-action${completed ? " done" : ""}`;
    action.textContent = completed ? "Done ✓" : (url ? "Open" : "Claim");
    action.disabled = completed;

    action.addEventListener("click", async () => {
      if (completed) return;

      if (url) {
        openExternal(url);
        action.textContent = "Claim";
      }

      action.disabled = true;

      try {
        const data = await api("/api/tasks/claim", {
          method: "POST",
          body: {
            task_id: id,
            wallet_address: state.walletAddress || ""
          }
        });

        if (data.user) applyUser(data.user);
        else if (data.balance !== undefined) {
          state.balance = number(data.balance, state.balance);
          renderHome();
        }

        toast(data.message || "Task claim processed.");
        await loadTasks();
      } catch (error) {
        toast(error.message || "Task could not be claimed.");
        action.disabled = false;
      }
    });

    row.append(icon, content, action);
    container.appendChild(row);
  });
}

/* ---------------- REFERRALS ---------------- */

async function loadFriends() {
  try {
    const data = await api("/api/friends");
    const friends = data.friends || data.referrals || data.data?.friends || [];

    state.referralCode =
      data.referral_code || data.referralCode || state.referralCode;

    const count = $("#referralCount");
    if (count) {
      count.textContent = formatNumber(
        data.referral_count ?? data.total_referrals ?? friends.length
      );
    }

    const earned = $("#referralEarned");
    if (earned) {
      earned.textContent = `${formatNumber(
        data.referral_earned ?? data.total_earned ?? 0
      )} SNP`;
    }

    const link = $("#referralLink");
    if (link) link.value = makeReferralLink();

    renderReferralList(friends);
  } catch (error) {
    console.error("Could not load referrals:", error);
    const link = $("#referralLink");
    if (link && !link.value) link.value = makeReferralLink();
  }
}

function makeReferralLink() {
  const botName = "SNPCOINBot";
  const code = state.referralCode;

  if (!code) return `https://t.me/${botName}?startapp`;
  return `https://t.me/${botName}?startapp=${encodeURIComponent(code)}`;
}

function renderReferralList(friends) {
  const container = $("#referralList");
  if (!container) return;

  container.replaceChildren();

  if (!Array.isArray(friends) || friends.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No referrals yet. Share your invite link to get started.";
    container.appendChild(empty);
    return;
  }

  friends.forEach((friend) => {
    const row = document.createElement("article");
    row.className = "task-row";

    const icon = document.createElement("div");
    icon.className = "task-icon";
    icon.textContent = "♧";

    const content = document.createElement("div");
    content.className = "task-content";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = friend.username || friend.first_name || "SINAPS user";

    const desc = document.createElement("div");
    desc.className = "task-description";
    desc.textContent = friend.wallet_address
      ? "TON wallet connected"
      : "Joined SINAPS";

    content.append(title, desc);
    row.append(icon, content);
    container.appendChild(row);
  });
}

async function copyReferral() {
  const link = makeReferralLink();

  try {
    await navigator.clipboard.writeText(link);
  } catch (_) {
    const input = $("#referralLink");
    if (input) {
      input.value = link;
      input.select();
      document.execCommand("copy");
    }
  }

  toast("Referral link copied.");
}

function shareReferral() {
  const link = makeReferralLink();
  const message = "Join SINAPS and start earning SNP!";
  const shareUrl =
    `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;

  if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
  else openExternal(shareUrl);
}

/* ---------------- TON CONNECT + WALLET ---------------- */

async function initWallet() {
  if (!window.TON_CONNECT_UI?.TonConnectUI) {
    console.warn("TON Connect UI library is unavailable.");
    return;
  }

  try {
    tonUI = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TON_MANIFEST,
      buttonRootId: "ton-connect-top"
    });

    tonUI.onStatusChange(async (wallet) => {
      if (wallet?.account?.address) {
        state.walletAddress = wallet.account.address;
        renderWallet();

        try {
          await api("/api/wallet/connect", {
            method: "POST",
            body: { wallet_address: state.walletAddress }
          });

          toast("TON wallet connected.");
          await loadWallet();
        } catch (error) {
          console.error("Wallet save failed:", error);
          toast("Wallet connected, but account sync failed.");
        }
      } else {
        state.walletAddress = null;
        renderWallet();
      }
    });

    const connected = tonUI.wallet;
    if (connected?.account?.address) {
      state.walletAddress = connected.account.address;
      renderWallet();
    }
  } catch (error) {
    console.error("TON Connect initialization failed:", error);
  }
}

async function connectWallet() {
  if (!tonUI) {
    toast("TON Connect is not ready. Please reload the app.");
    return;
  }

  try {
    await tonUI.openModal();
  } catch (error) {
    console.error(error);
    toast("Could not open TON Connect.");
  }
}

async function loadWallet() {
  try {
    const data = await api("/api/wallet/get", {
      method: "POST",
      body: {}
    });

    const wallet = data.wallet || data.data?.wallet || data;
    const serverAddress =
      wallet.wallet_address || wallet.address || null;

    // Prefer the currently connected TON Connect wallet.
    if (tonUI?.wallet?.account?.address) {
      state.walletAddress = tonUI.wallet.account.address;
    } else if (serverAddress) {
      state.walletAddress = serverAddress;
    }

    renderWallet();
  } catch (error) {
    console.error("Could not load wallet:", error);
    renderWallet();
  }
}

async function disconnectWallet() {
  try {
    if (tonUI?.wallet) await tonUI.disconnect();

    await api("/api/wallet/disconnect", {
      method: "POST",
      body: {}
    });

    state.walletAddress = null;
    renderWallet();
    toast("Wallet disconnected.");
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not disconnect wallet.");
  }
}

async function withdraw() {
  const amountInput = $("#withdrawAmount");
  const amount = number(amountInput?.value, 0);

  if (!state.walletAddress) {
    toast("Connect your TON wallet first.");
    return;
  }

  if (!amount || amount <= 0) {
    toast("Enter a valid SNP amount.");
    return;
  }

  if (!tonUI?.wallet) {
    toast("Reconnect your wallet before withdrawing.");
    return;
  }

  const button = $("#withdrawButton");
  if (button) button.disabled = true;

  let requestId = null;

  try {
    const created = await api("/api/withdraw/create", {
      method: "POST",
      body: {
        amount,
        wallet_address: state.walletAddress
      }
    });

    const data = created.withdrawal || created.data || created;
    requestId = data.id || data.withdrawal_id || data.request_id;

    const treasury = data.treasury_wallet;
    const feeNano = data.fee_nano;

    if (!treasury || !feeNano) {
      throw new Error(
        "Withdrawal request did not include the fee payment details. Contact support before retrying."
      );
    }

    await tonUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{
        address: treasury,
        amount: String(feeNano)
      }]
    });

    const verifyBody = { amount, wallet_address: state.walletAddress };
    if (requestId) verifyBody.withdrawal_id = requestId;

    const verified = await api("/api/withdraw/verify", {
      method: "POST",
      body: verifyBody
    });

    toast(verified.message || "Withdrawal verification submitted.");
    if (amountInput) amountInput.value = "";

    await Promise.allSettled([
      loadUserSummary(),
      loadWithdrawHistory()
    ]);
  } catch (error) {
    console.error("Withdrawal flow failed:", error);

    // Do not automatically cancel a request after a wallet payment attempt.
    // Check the server history/status before trying the payment again.
    toast(error.message || "Withdrawal could not be completed.");
    await loadWithdrawHistory();
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadWithdrawHistory() {
  const container = $("#withdrawHistory");
  if (!container) return;

  try {
    const data = await api("/api/withdraw/history", {
      method: "POST",
      body: {}
    });

    const items =
      data.withdrawals || data.history || data.transactions || [];

    renderWithdrawHistory(items);
  } catch (error) {
    // Keep history usable even if this backend version doesn't expose history.
    console.warn("Withdrawal history unavailable:", error);
    if (!container.children.length) {
      container.innerHTML = '<div class="empty-state">Transaction history is currently unavailable.</div>';
    }
  }
}

function renderWithdrawHistory(items) {
  const container = $("#withdrawHistory");
  if (!container) return;

  container.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No transactions to display.";
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "task-row";

    const icon = document.createElement("div");
    icon.className = "task-icon";
    icon.textContent = "↗";

    const content = document.createElement("div");
    content.className = "task-content";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = `${formatNumber(item.amount || 0)} SNP withdrawal`;

    const desc = document.createElement("div");
    desc.className = "task-description";
    desc.textContent = item.status || item.state || "Pending";

    content.append(title, desc);
    row.append(icon, content);

    if (item.tx_hash || item.transaction_hash) {
      const hash = item.tx_hash || item.transaction_hash;
      const link = document.createElement("button");
      link.type = "button";
      link.className = "task-action";
      link.textContent = "View";
      link.addEventListener("click", () => {
        openExternal(`https://tonviewer.com/transaction/${encodeURIComponent(hash)}`);
      });
      row.appendChild(link);
    }

    container.appendChild(row);
  });
}

/* ---------------- MARKET + EXTERNAL LINKS ---------------- */

function openExternal(url) {
  if (!url) return;

  try {
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch (_) {}

  window.open(url, "_blank", "noopener,noreferrer");
}

/* ---------------- EVENTS + STARTUP ---------------- */

function setupEvents() {
  $("#sCoin")?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    tap(event);
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.nav));
  });

  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.goto));
  });

  $("#dailyGift")?.addEventListener("click", openDailyModal);
  $("#claimDaily")?.addEventListener("click", claimDaily);

  document.querySelectorAll("[data-close-daily]").forEach((button) => {
    button.addEventListener("click", closeDailyModal);
  });

  $("#connectWallet")?.addEventListener("click", connectWallet);
  $("#disconnectWallet")?.addEventListener("click", disconnectWallet);
  $("#withdrawButton")?.addEventListener("click", withdraw);

  $("#copyReferral")?.addEventListener("click", copyReferral);
  $("#shareReferral")?.addEventListener("click", shareReferral);

  $("#chartButton")?.addEventListener("click", () => openExternal(SNP_CHART_URL));
  $("#buySnpButton")?.addEventListener("click", () => openExternal(SNP_BUY_URL));

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      loadUserSummary();
    }
  });
}

async function init() {
  setupEvents();

  const user = telegramUser();
  if (user) {
    state.username = user.username
      ? `@${user.username}`
      : (user.first_name || "SINAPS User");
  }

  loadFastCache();
  renderHome();
  renderWallet();

  // Don't block the UI while the API starts up.
  startEnergyRegen();

  await loadUser();
  await initWallet();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
