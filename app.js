const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();

  // عمداً expand() نداریم.
  // Mini App در حالت عادی/windowed باقی می‌ماند.
  tg.setHeaderColor("#020611");
  tg.setBackgroundColor("#020611");
}


// ============================================================
// CONFIG
// ============================================================

const API =
  "https://sinaps-backend.onrender.com";

const TON_MANIFEST =
  "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json";


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

let energyTimer = null;


// ============================================================
// HELPERS
// ============================================================

function $(id) {
  return document.getElementById(id);
}


function formatNumber(value) {

  return Number(value || 0)
    .toLocaleString("en-US");
}


function telegramUser() {

  return tg?.initDataUnsafe?.user || null;
}


function authHeaders() {

  return {

    "Content-Type":
      "application/json",

    "X-Telegram-Init-Data":
      tg?.initData || ""

  };
}


async function api(
  path,
  options = {}
) {

  const response =
    await fetch(
      API + path,
      {
        ...options,

        headers: {
          ...authHeaders(),
          ...(options.headers || {})
        }
      }
    );


  let data = {};

  try {
    data = await response.json();
  } catch (_) {}


  if (!response.ok) {

    throw new Error(
      data.error ||
      "Request failed"
    );
  }


  return data;
}


function toast(message) {

  const el = $("toast");

  if (!el) return;

  el.textContent = message;

  el.classList.add("show");

  clearTimeout(
    el._timer
  );

  el._timer =
    setTimeout(
      () => {
        el.classList.remove("show");
      },
      2200
    );
}


// ============================================================
// USER
// ============================================================

function applyUser(user) {

  if (!user) return;


  state.balance =
    Number(user.balance || 0);

  state.energy =
    Number(user.energy || 0);

  state.maxEnergy =
    Number(user.max_energy || 1000);

  state.tapPower =
    Number(user.tap_power || 1);

  state.rechargeMultiplier =
    Number(
      user.recharge_multiplier || 1
    );

  state.tapBoostLevel =
    Number(
      user.tap_boost_level || 1
    );

  state.energyBoostLevel =
    Number(
      user.energy_boost_level || 1
    );

  state.rechargeLevel =
    Number(
      user.recharge_level || 1
    );

  state.walletAddress =
    user.wallet_address ||
    state.walletAddress;


  renderUser();

  renderWallet();

  renderBoostBalance();
}


function renderUser() {

  const user =
    telegramUser();


  if ($("username")) {

    $("username").textContent =
      user?.username
        ? `@${user.username}`
        : user?.first_name
          ? user.first_name
          : "@user";
  }


  if ($("balance")) {

    $("balance").textContent =
      formatNumber(
        state.balance
      );
  }


  if ($("boostBalance")) {

    $("boostBalance").textContent =
      formatNumber(
        state.balance
      );
  }


  renderEnergy();
}


function renderBoostBalance() {

  if ($("boostBalance")) {

    $("boostBalance").textContent =
      formatNumber(
        state.balance
      );
  }
}


async function loadUser() {

  try {

    const user =
      telegramUser();


    const data =
      await api(
        "/api/user",
        {
          method: "POST",

          body:
            JSON.stringify({
              username:
                user?.username || "",

              start_param:
                tg?.initDataUnsafe
                  ?.start_param || ""
            })
        }
      );


    applyUser(
      data.user
    );


    await Promise.allSettled([
      loadBoosts(),
      loadTasks(),
      loadFriends(),
      loadWallet(),
      loadDaily()
    ]);


  } catch (error) {

    console.error(
      "loadUser:",
      error
    );

    toast(
      error.message ||
      "Server connection failed"
    );
  }
}


// ============================================================
// ENERGY
// ============================================================

function renderEnergy() {

  const energy =
    Math.max(
      0,
      Math.min(
        state.energy,
        state.maxEnergy
      )
    );


  if ($("energy")) {

    $("energy").textContent =
      `${formatNumber(energy)} / ${formatNumber(state.maxEnergy)}`;
  }


  if ($("energyFill")) {

    const percent =
      state.maxEnergy > 0
        ? (
            energy /
            state.maxEnergy
          ) * 100
        : 0;


    $("energyFill").style.width =
      `${percent}%`;
  }
}


function startEnergyTimer() {

  clearInterval(
    energyTimer
  );


  const interval =
    3000 /
    Math.max(
      1,
      state.rechargeMultiplier
    );


  energyTimer =
    setInterval(
      () => {

        if (
          state.energy <
          state.maxEnergy
        ) {

          state.energy =
            Math.min(
              state.maxEnergy,
              state.energy + 1
            );

          renderEnergy();
        }

      },
      interval
    );
}


// ============================================================
// TAP
// ============================================================

function showTapNumber(
  event,
  amount
) {

  const area =
    $("tapArea");

  const container =
    $("floaters");


  if (!area || !container) {
    return;
  }


  const rect =
    area.getBoundingClientRect();


  const x =
    event?.clientX ??
    (
      rect.left +
      rect.width / 2
    );


  const y =
    event?.clientY ??
    (
      rect.top +
      rect.height / 2
    );


  const el =
    document.createElement("div");


  el.className =
    "tap-floater";


  el.textContent =
    `+${amount}`;


  el.style.left =
    `${x - rect.left}px`;


  el.style.top =
    `${y - rect.top}px`;


  container.appendChild(
    el
  );


  setTimeout(
    () => el.remove(),
    800
  );
}


function tap(event) {

  if (
    state.energy <= 0
  ) {

    toast(
      "No energy"
    );

    return;
  }


  const reward =
    state.tapPower;


  state.energy--;

  state.balance += reward;

  tapQueue++;


  renderUser();

  showTapNumber(
    event,
    reward
  );


  if (!tapTimer) {

    tapTimer =
      setTimeout(
        flushTaps,
        120
      );
  }
}


async function flushTaps() {

  clearTimeout(
    tapTimer
  );

  tapTimer = null;


  if (tapQueue <= 0) {
    return;
  }


  const count =
    Math.min(
      tapQueue,
      50
    );


  tapQueue -= count;


  try {

    const data =
      await api(
        "/api/tap",
        {
          method: "POST",

          body:
            JSON.stringify({
              count
            })
        }
      );


    applyUser(
      data.user
    );


  } catch (error) {

    console.error(
      "tap:",
      error
    );


    // Server is authoritative.
    await loadUser();
  }


  if (tapQueue > 0) {

    tapTimer =
      setTimeout(
        flushTaps,
        100
      );
  }
}


// ============================================================
// BOOSTS
// ============================================================

async function loadBoosts() {

  try {

    const data =
      await api(
        "/api/boosts"
      );


    renderBoosts(
      data.boosts || []
    );


  } catch (error) {

    console.error(
      "boosts:",
      error
    );
  }
}


function renderBoosts(
  boosts
) {

  const container =
    $("boostsList");


  if (!container) return;


  container.innerHTML = "";


  const groups = [
    {
      title: "⚡ Tap Power",
      type: "tap"
    },
    {
      title: "🔋 Energy Capacity",
      type: "energy"
    },
    {
      title: "🚀 Energy Recharge",
      type: "recharge"
    }
  ];


  groups.forEach(
    group => {

      const items =
        boosts.filter(
          boost =>
            boost.type ===
            group.type
        );


      if (!items.length) {
        return;
      }


      const heading =
        document.createElement(
          "div"
        );


      heading.className =
        "boost-group-title";


      heading.textContent =
        group.title;


      container.appendChild(
        heading
      );


      items.forEach(
        boost => {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "boost-card";


          if (boost.owned) {
            card.classList.add(
              "owned"
            );
          }


          let description =
            boost.description;


          if (
            boost.type ===
            "tap"
          ) {

            description =
              `Each tap gives ${boost.level} SNP`;
          }


          if (
            boost.type ===
            "energy"
          ) {

            description =
              `Maximum energy ${formatNumber(
                boost.level * 1000
              )}`;
          }


          if (
            boost.type ===
            "recharge"
          ) {

            description =
              `Recharge ${boost.level}× faster`;
          }


          card.innerHTML = `

            <div class="boost-icon">
              ${boost.icon}
            </div>

            <div class="boost-info">

              <div class="boost-name">
                ${boost.name}
              </div>

              <div class="boost-description">
                ${description}
              </div>

            </div>

            <div>

              <button
                class="boost-buy ${
                  boost.owned
                    ? "owned-btn"
                    : ""
                }"
                ${
                  boost.owned
                    ? "disabled"
                    : ""
                }
                data-boost-id="${boost.id}"
              >
                ${
                  boost.owned
                    ? "ACTIVE"
                    : `${formatNumber(boost.price)} SNP`
                }
              </button>

            </div>

          `;


          container.appendChild(
            card
          );
        }
      );
    }
  );


  container
    .querySelectorAll(
      ".boost-buy:not(.owned-btn)"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            buyBoost(
              button.dataset.boostId
            );
          }
        );
      }
    );
}


async function buyBoost(
  boostId
) {

  try {

    const data =
      await api(
        "/api/boosts/buy",
        {
          method: "POST",

          body:
            JSON.stringify({
              boost_id:
                boostId
            })
        }
      );


    applyUser(
      data.user
    );


    toast(
      data.message ||
      "Boost activated"
    );


    startEnergyTimer();

    await loadBoosts();


  } catch (error) {

    toast(
      error.message
    );
  }
}


// ============================================================
// DAILY
// ============================================================

async function loadDaily() {

  try {

    const data =
      await api(
        "/api/daily/status"
      );


    renderDaily(
      data
    );


  } catch (error) {

    console.error(
      "daily:",
      error
    );
  }
}


function renderDaily(
  data
) {

  const grid =
    $("dailyGrid");


  if (!grid) return;


  grid.innerHTML = "";


  const nextDay =
    Number(
      data.nextDay || 1
    );


  const claimedDays =
    Array.isArray(
      data.claimedDays
    )
      ? data.claimedDays
      : [];


  for (
    let day = 1;
    day <= 30;
    day++
  ) {

    const cell =
      document.createElement(
        "div"
      );


    cell.className =
      "daily-day";


    if (
      claimedDays.includes(
        day
      )
    ) {

      cell.classList.add(
        "claimed"
      );
    }


    if (
      day === nextDay &&
      !data.claimedToday
    ) {

      cell.classList.add(
        "current"
      );
    }


    if (
      day > nextDay &&
      !claimedDays.includes(day)
    ) {

      cell.classList.add(
        "locked"
      );
    }


    cell.innerHTML = `

      <div class="daily-day-number">
        DAY ${day}
      </div>

      <div class="daily-day-reward">
        ${day * 10} SNP
      </div>

      ${
        claimedDays.includes(day)
          ? `<div style="font-size:9px;margin-top:3px;color:#5ee49e">✓</div>`
          : ""
      }

    `;


    grid.appendChild(
      cell
    );
  }


  const dot =
    $("dailyDot");


  if (dot) {

    dot.classList.toggle(
      "hidden",
      Boolean(
        data.claimedToday
      )
    );
  }
}


async function claimDaily() {

  try {

    const data =
      await api(
        "/api/daily/claim",
        {
          method: "POST",

          body: "{}"
        }
      );


    state.balance =
      Number(
        data.balance
      );


    renderUser();


    toast(
      `+${formatNumber(data.reward)} SNP`
    );


    await loadDaily();


  } catch (error) {

    toast(
      error.message
    );
  }
}


function openDaily() {

  const modal =
    $("dailyModal");


  if (!modal) return;


  modal.classList.add(
    "show"
  );


  loadDaily();
}


function closeDaily() {

  const modal =
    $("dailyModal");


  if (!modal) return;


  modal.classList.remove(
    "show"
  );
}


// ============================================================
// WALLET
// ============================================================

function shortAddress(
  address
) {

  if (!address) {
    return "";
  }


  if (address.length < 15) {
    return address;
  }


  return (
    address.slice(0, 5) +
    "..." +
    address.slice(-5)
  );
}


function renderWallet() {

  const top =
    $("walletTop");

  const wallet =
    $("walletAddress");


  if (
    state.walletAddress
  ) {

    if (top) {

      top.textContent =
        shortAddress(
          state.walletAddress
        );

      top.classList.add(
        "connected"
      );
    }


    if (wallet) {

      wallet.textContent =
        state.walletAddress;
    }


  } else {

    if (top) {

      top.textContent =
        "CONNECT";

      top.classList.remove(
        "connected"
      );
    }


    if (wallet) {

      wallet.textContent =
        "Not connected";
    }
  }
}


async function initWallet() {

  try {

    if (
      !window.TON_CONNECT_UI
    ) {

      console.error(
        "TON Connect UI missing"
      );

      return;
    }


    tonUI =
      new TON_CONNECT_UI.TonConnectUI(
        {
          manifestUrl:
            TON_MANIFEST,

          buttonRootId:
            "ton-connect"
        }
      );


    tonUI.onStatusChange(
      async wallet => {

        if (!wallet) {
          return;
        }


        const address =
          wallet.account.address;


        state.walletAddress =
          address;


        renderWallet();


        try {

          await api(
            "/api/wallet/connect",
            {
              method: "POST",

              body:
                JSON.stringify({
                  wallet_address:
                    address
                })
            }
          );


          toast(
            "Wallet connected"
          );


        } catch (error) {

          toast(
            "Wallet could not be saved"
          );
        }
      }
    );


  } catch (error) {

    console.error(
      "TON Connect:",
      error
    );
  }
}


async function connectWallet() {

  if (!tonUI) {

    toast(
      "Wallet is not ready"
    );

    return;
  }


  try {

    await tonUI.openModal();

  } catch (error) {

    console.error(
      error
    );
  }
}


async function loadWallet() {

  try {

    const data =
      await api(
        "/api/wallet/get",
        {
          method: "POST",
          body: "{}"
        }
      );


    if (
      data.wallet_address
    ) {

      state.walletAddress =
        data.wallet_address;
    }


    renderWallet();


  } catch (_) {

    renderWallet();
  }
}


// ============================================================
// WITHDRAW
// ============================================================

async function withdraw() {

  const input =
    $("withdrawAmount");


  const amount =
    Number(
      input?.value || 0
    );


  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {

    toast(
      "Enter a valid amount"
    );

    return;
  }


  if (
    !state.walletAddress
  ) {

    toast(
      "Connect your wallet first"
    );

    return;
  }


  if (
    amount >
    state.balance
  ) {

    toast(
      "Not enough SNP"
    );

    return;
  }


  try {

    const data =
      await api(
        "/api/withdraw/create",
        {
          method: "POST",

          body:
            JSON.stringify({
              amount,
              wallet_address:
                state.walletAddress
            })
        }
      );


    state.balance =
      Number(
        data.balance
      );


    renderUser();


    toast(
      "Withdrawal created"
    );


    if (!tonUI) {
      return;
    }


    try {

      await tonUI.sendTransaction(
        {
          validUntil:
            Math.floor(
              Date.now() / 1000
            ) + 300,

          messages: [
            {
              address:
                "UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX",

              amount:
                String(
                  data.fee_nano
                )
            }
          ]
        }
      );


      await api(
        "/api/withdraw/verify",
        {
          method: "POST",

          body:
            JSON.stringify({
              withdrawal_id:
                data.withdrawal_id
            })
        }
      );


      toast(
        "Fee paid. Withdrawal pending."
      );


    } catch (feeError) {

      try {

        await api(
          "/api/withdraw/cancel",
          {
            method: "POST",

            body:
              JSON.stringify({
                withdrawal_id:
                  data.withdrawal_id
              })
          }
        );


        await loadUser();

      } catch (_) {}


      toast(
        "Withdrawal cancelled"
      );
    }


  } catch (error) {

    toast(
      error.message
    );
  }
}


// ============================================================
// TASKS
// ============================================================

async function loadTasks() {

  try {

    const data =
      await api(
        "/api/tasks"
      );


    const container =
      $("tasksList");


    if (!container) return;


    container.innerHTML = "";


    data.tasks.forEach(
      task => {

        const row =
          document.createElement(
            "div"
          );


        row.className =
          "task-row";


        row.innerHTML = `

          <div class="task-icon">
            ${task.icon}
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
            ${
              task.completed
                ? "disabled"
                : ""
            }
            data-task-id="${task.id}"
          >
            ${
              task.completed
                ? "DONE"
                : "VERIFY"
            }
          </button>

        `;


        container.appendChild(
          row
        );
      }
    );


    container
      .querySelectorAll(
        ".task-button:not(:disabled)"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => claimTask(
              button.dataset.taskId
            )
          );
        }
      );


  } catch (error) {

    console.error(
      error
    );
  }
}


async function claimTask(
  taskId
) {

  try {

    const data =
      await api(
        "/api/tasks/claim",
        {
          method: "POST",

          body:
            JSON.stringify({
              task_id:
                taskId,

              wallet_address:
                state.walletAddress || ""
            })
        }
      );


    state.balance =
      Number(
        data.balance
      );


    renderUser();


    toast(
      `+${formatNumber(data.reward)} SNP`
    );


    await loadTasks();


  } catch (error) {

    toast(
      error.message
    );
  }
}


// ============================================================
// FRIENDS
// ============================================================

async function loadFriends() {

  try {

    const data =
      await api(
        "/api/friends"
      );


    const input =
      $("referralLink");


    if (input) {

      input.value =
        data.referral_link || "";
    }


    const container =
      $("friendsList");


    if (!container) return;


    container.innerHTML = "";


    if (
      !data.friends?.length
    ) {

      container.innerHTML =
        `<div class="page-subtitle">
          No invited friends yet.
        </div>`;

      return;
    }


    data.friends.forEach(
      friend => {

        const row =
          document.createElement(
            "div"
          );


        row.className =
          "friend-row";


        row.innerHTML = `

          <span>
            👤
          </span>

          <strong>
            ${friend.username || "User"}
          </strong>

        `;


        container.appendChild(
          row
        );
      }
    );


  } catch (error) {

    console.error(
      error
    );
  }
}


async function copyReferral() {

  const input =
    $("referralLink");


  if (!input?.value) {
    return;
  }


  try {

    await navigator.clipboard.writeText(
      input.value
    );


    toast(
      "Referral link copied"
    );


  } catch (_) {

    input.select();

    document.execCommand(
      "copy"
    );

    toast(
      "Copied"
    );
  }
}


// ============================================================
// HISTORY
// ============================================================

async function loadHistory() {

  try {

    const data =
      await api(
        "/api/history"
      );


    const container =
      $("historyList");


    if (!container) return;


    container.innerHTML = "";


    (data.history || [])
      .forEach(
        item => {

          const amount =
            Number(
              item.amount || 0
            );


          const row =
            document.createElement(
              "div"
            );


          row.className =
            "history-row";


          row.innerHTML = `

            <div>

              <strong>
                ${item.type || "Transaction"}
              </strong>

              <small>
                ${item.details || ""}
              </small>

            </div>

            <strong class="${
              amount >= 0
                ? "positive"
                : "negative"
            }">

              ${
                amount >= 0
                  ? "+"
                  : ""
              }

              ${formatNumber(amount)}

            </strong>

          `;


          container.appendChild(
            row
          );
        }
      );


  } catch (error) {

    console.error(
      error
    );
  }
}


// ============================================================
// GAME
// ============================================================

function playGame() {

  const result =
    $("gameResult");


  if (!result) return;


  if (
    Math.random() >
    .5
  ) {

    result.textContent =
      "🎉 You won!";

  } else {

    result.textContent =
      "😅 Try again!";
  }
}


// ============================================================
// NAVIGATION
// ============================================================

function showPage(
  page
) {

  state.currentPage =
    page;


  document
    .querySelectorAll(
      ".page"
    )
    .forEach(
      element => {

        element.classList.toggle(
          "active",
          element.dataset.page ===
          page
        );
      }
    );


  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.page ===
          page
        );
      }
    );


  if (
    page === "boost"
  ) {

    loadBoosts();
  }


  if (
    page === "tasks"
  ) {

    loadTasks();
  }


  if (
    page === "friends"
  ) {

    loadFriends();
  }


  if (
    page === "wallet"
  ) {

    loadWallet();
    loadHistory();
  }
}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {

  const coin =
    $("sCoin");


  if (coin) {

    coin.addEventListener(
      "pointerdown",
      event => {

        event.preventDefault();

        tap(event);
      },
      {
        passive: false
      }
    );
  }


  // Daily

  $("dailyGift")
    ?.addEventListener(
      "click",
      openDaily
    );


  $("dailyClose")
    ?.addEventListener(
      "click",
      closeDaily
    );


  document
    .querySelector(
      ".modal-backdrop"
    )
    ?.addEventListener(
      "click",
      closeDaily
    );


  // Navigation

  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            showPage(
              button.dataset.page
            );
          }
        );
      }
    );


  // Wallet top button

  $("walletTop")
    ?.addEventListener(
      "click",
      async () => {

        if (
          state.walletAddress
        ) {

          showPage(
            "wallet"
          );

        } else {

          await connectWallet();
        }
      }
    );


  $("withdrawButton")
    ?.addEventListener(
      "click",
      withdraw
    );


  $("copyReferral")
    ?.addEventListener(
      "click",
      copyReferral
    );


  $("playGame")
    ?.addEventListener(
      "click",
      playGame
    );
}


// ============================================================
// INIT
// ============================================================

async function init() {

  setupEvents();

  await initWallet();

  await loadUser();

  startEnergyTimer();
}


document.addEventListener(
  "DOMContentLoaded",
  init
);
