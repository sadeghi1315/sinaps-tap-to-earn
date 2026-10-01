const API = "https://sinaps-backend.onrender.com";

const tg = window.Telegram?.WebApp;

if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {
    console.warn("Telegram init error:", e);
  }
}

const telegramUser =
  tg?.initDataUnsafe?.user || null;

const telegramId =
  telegramUser?.id || null;

const telegramUsername =
  telegramUser?.username ||
  telegramUser?.first_name ||
  "SINAPS User";

const $ = (id) =>
  document.getElementById(id);


// ======================================================
// STATE
// ======================================================

let state = {
  points: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  doubleBoost: false,
  lastEnergyTime: Date.now(),
  walletAddress: null
};

let tonConnectUI = null;

let tapInitialized = false;
let navigationInitialized = false;
let energyStarted = false;
let boostInitialized = false;


// ======================================================
// LOAD LOCAL STATE
// ======================================================

try {

  const saved =
    localStorage.getItem(
      "sinaps_v1_state"
    );

  if (saved) {

    const parsed =
      JSON.parse(saved);

    state = {
      ...state,
      ...parsed
    };
  }

} catch (error) {

  console.warn(
    "Local state error:",
    error
  );
}


// ======================================================
// SAVE STATE
// ======================================================

function saveState() {

  try {

    localStorage.setItem(
      "sinaps_v1_state",
      JSON.stringify(state)
    );

  } catch (error) {

    console.warn(
      "Save state error:",
      error
    );
  }
}


// ======================================================
// FORMAT NUMBER
// ======================================================

function formatNumber(value) {

  const number =
    Number(value) || 0;

  return Math.floor(
    number
  ).toLocaleString("en-US");
}


// ======================================================
// RENDER BALANCE
// ======================================================

function renderBalance() {

  const balance =
    $("balance");

  const energy =
    $("energy");

  const energyCurrent =
    $("energyCurrent");

  const energyMax =
    $("energyMax");

  const energyFill =
    $("energyFill");

  const tapPower =
    $("tapPower");

  const level =
    $("level");


  if (balance) {

    balance.textContent =
      formatNumber(
        state.points
      );
  }


  if (energy) {

    energy.textContent =
      `${Math.floor(state.energy)} / ${Math.floor(state.maxEnergy)}`;
  }


  if (energyCurrent) {

    energyCurrent.textContent =
      Math.floor(
        state.energy
      );
  }


  if (energyMax) {

    energyMax.textContent =
      Math.floor(
        state.maxEnergy
      );
  }


  if (energyFill) {

    const percent =
      state.maxEnergy > 0
        ? (
            state.energy /
            state.maxEnergy
          ) * 100
        : 0;

    energyFill.style.width =
      `${Math.max(
        0,
        Math.min(
          100,
          percent
        )
      )}%`;
  }


  if (tapPower) {

    tapPower.textContent =
      `x${state.tapPower}`;
  }


  if (level) {

    level.textContent =
      Math.max(
        1,
        Math.floor(
          state.points / 1000
        ) + 1
      );
  }
}


// ======================================================
// USERNAME
// ======================================================

function renderUsername() {

  const username =
    $("username");

  if (!username) {
    return;
  }

  if (telegramUser?.username) {

    username.textContent =
      "@" +
      telegramUser.username;

  } else if (
    telegramUser?.first_name
  ) {

    username.textContent =
      telegramUser.first_name;

  } else {

    username.textContent =
      "SINAPS User";
  }


  const avatar =
    $("userAvatar");

  if (avatar) {

    avatar.textContent =
      (
        telegramUser?.first_name ||
        "S"
      )
      .charAt(0)
      .toUpperCase();
  }
}


// ======================================================
// WALLET
// ======================================================

function shortAddress(address) {

  if (!address) {
    return "Connect";
  }

  if (address.length < 16) {
    return address;
  }

  return (
    address.slice(0, 6) +
    "..." +
    address.slice(-6)
  );
}


function renderWallet() {

  const walletAddress =
    $("walletAddress");

  const walletTop =
    $("walletTop");

  const walletTitle =
    $("walletTitle");


  if (walletAddress) {

    if (state.walletAddress) {

      walletAddress.textContent =
        state.walletAddress;

    } else {

      walletAddress.textContent =
        "Connect your TON wallet to continue.";
    }
  }


  if (walletTop) {

    walletTop.textContent =
      state.walletAddress
        ? shortAddress(
            state.walletAddress
          )
        : "Connect";
  }


  if (walletTitle) {

    walletTitle.textContent =
      state.walletAddress
        ? "Wallet Connected"
        : "Wallet not connected";
  }
}


// ======================================================
// LOAD USER
// ======================================================

async function loadUser() {

  if (!telegramId) {

    console.warn(
      "Telegram ID unavailable."
    );

    return;
  }

  try {

    const response =
      await fetch(
        `${API}/api/user`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            telegram_id:
              telegramId,

            username:
              telegramUsername
          })
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      data.balance !== undefined
    ) {

      state.points =
        Number(
          data.balance
        ) || 0;
    }


    if (
      data.energy !== undefined
    ) {

      state.energy =
        Number(
          data.energy
        );
    }


    if (
      data.max_energy !== undefined
    ) {

      state.maxEnergy =
        Number(
          data.max_energy
        );
    }


    if (
      data.wallet_address
    ) {

      state.walletAddress =
        data.wallet_address;
    }


    state.lastEnergyTime =
      Date.now();


    saveState();

    renderBalance();

    renderWallet();


    console.log(
      "User loaded:",
      data
    );

  } catch (error) {

    console.warn(
      "User backend error:",
      error
    );
  }
}


// ======================================================
// LOAD SAVED WALLET
// ======================================================

async function loadSavedWallet() {

  if (!telegramId) {
    return;
  }

  try {

    const response =
      await fetch(
        `${API}/api/wallet/get`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            telegram_id:
              telegramId
          })
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      data?.wallet_address
    ) {

      state.walletAddress =
        data.wallet_address;

      saveState();

      renderWallet();
    }

  } catch (error) {

    console.warn(
      "Wallet load error:",
      error
    );
  }
}


// ======================================================
// SAVE WALLET
// ======================================================

async function saveWalletToBackend(
  walletAddress
) {

  if (
    !telegramId ||
    !walletAddress
  ) {
    return;
  }

  try {

    const response =
      await fetch(
        `${API}/api/wallet/connect`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            telegram_id:
              telegramId,

            wallet_address:
              walletAddress
          })
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    state.walletAddress =
      data?.wallet_address ||
      walletAddress;


    saveState();

    renderWallet();


  } catch (error) {

    console.error(
      "Wallet save error:",
      error
    );
  }
}


// ======================================================
// DISCONNECT BACKEND
// ======================================================

async function disconnectWalletBackend() {

  if (!telegramId) {
    return;
  }

  try {

    await fetch(
      `${API}/api/wallet/disconnect`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          telegram_id:
            telegramId
        })
      }
    );

  } catch (error) {

    console.warn(
      "Disconnect backend error:",
      error
    );
  }
}


// ======================================================
// TON CONNECT
// ======================================================

function initTonConnect() {

  if (tonConnectUI) {
    return;
  }

  if (
    typeof TON_CONNECT_UI ===
    "undefined"
  ) {

    console.warn(
      "TON Connect library unavailable."
    );

    return;
  }


  const button =
    $("ton-connect-button");

  if (!button) {
    return;
  }


  try {

    tonConnectUI =
      new TON_CONNECT_UI.TonConnectUI({

        manifestUrl:
          "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json",

        buttonRootId:
          "ton-connect-button"

      });


    tonConnectUI.onStatusChange(
      async (wallet) => {

        if (wallet) {

          const address =
            wallet.account?.address;

          if (address) {

            state.walletAddress =
              address;

            saveState();

            renderWallet();

            await saveWalletToBackend(
              address
            );
          }

        } else {

          state.walletAddress =
            null;

          saveState();

          renderWallet();
        }
      }
    );


    console.log(
      "TON Connect ready."
    );

  } catch (error) {

    console.error(
      "TON Connect error:",
      error
    );
  }
}


// ======================================================
// DISCONNECT BUTTON
// ======================================================

function setupDisconnectButton() {

  const button =
    $("disconnectWallet");

  if (!button) {
    return;
  }


  if (
    button.dataset.ready ===
    "true"
  ) {
    return;
  }


  button.dataset.ready =
    "true";


  button.addEventListener(
    "click",
    async () => {

      try {

        if (tonConnectUI) {

          await tonConnectUI.disconnect();
        }

      } catch (error) {

        console.warn(
          "TON disconnect error:",
          error
        );
      }


      state.walletAddress =
        null;

      saveState();

      renderWallet();

      await disconnectWalletBackend();
    }
  );
}


// ======================================================
// TAP BACKEND
// ======================================================

async function sendTapToBackend(
  taps = 1
) {

  if (!telegramId) {
    return;
  }


  try {

    const response =
      await fetch(
        `${API}/api/tap`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            telegram_id:
              telegramId,

            taps:
              taps,

            power:
              state.tapPower

          })
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    /*
     * فقط اگر backend مقدار معتبر
     * برگرداند state را آپدیت می‌کنیم.
     */

    if (
      data &&
      data.balance !== undefined
    ) {

      state.points =
        Number(
          data.balance
        ) || state.points;
    }


    if (
      data &&
      data.energy !== undefined
    ) {

      state.energy =
        Number(
          data.energy
        );
    }


    if (
      data &&
      data.max_energy !== undefined
    ) {

      state.maxEnergy =
        Number(
          data.max_energy
        );
    }


    saveState();

    renderBalance();


  } catch (error) {

    console.warn(
      "Tap backend error:",
      error
    );
  }
}


// ======================================================
// TAP FLOATING NUMBER
// ======================================================

function createTapEffect(
  x,
  y,
  amount
) {

  const element =
    document.createElement(
      "div"
    );


  element.className =
    "tap-plus";


  element.textContent =
    `+${amount}`;


  element.style.position =
    "fixed";


  element.style.left =
    `${x}px`;


  element.style.top =
    `${y}px`;


  element.style.zIndex =
    "99999";


  element.style.pointerEvents =
    "none";


  document.body.appendChild(
    element
  );


  requestAnimationFrame(() => {

    element.classList.add(
      "show"
    );
  });


  setTimeout(() => {

    element.remove();

  }, 1000);
}


// ======================================================
// LOGO TAP ANIMATION
// ======================================================

function animateLogo(
  event
) {

  const logo =
    $("sLogo");

  if (!logo) {
    return;
  }


  const rect =
    logo.getBoundingClientRect();


  const centerX =
    rect.left +
    rect.width / 2;


  const centerY =
    rect.top +
    rect.height / 2;


  const dx =
    event.clientX -
    centerX;


  const dy =
    event.clientY -
    centerY;


  const angle =
    Math.atan2(
      dy,
      dx
    ) *
    180 /
    Math.PI;


  const rotateY =
    Math.max(
      -22,
      Math.min(
        22,
        dx / 5
      )
    );


  const rotateX =
    Math.max(
      -22,
      Math.min(
        22,
        -dy / 5
      )
    );


  logo.style.transform =
    `
      translate3d(
        ${dx * 0.04}px,
        ${dy * 0.04}px,
        0
      )
      rotateX(${rotateX}deg)
      rotateY(${rotateY}deg)
      rotateZ(${angle * 0.08}deg)
      scale(0.94)
    `;


  logo.classList.remove(
    "tap-active"
  );


  void logo.offsetWidth;


  logo.classList.add(
    "tap-active"
  );


  setTimeout(() => {

    logo.style.transform =
      "";

    logo.classList.remove(
      "tap-active"
    );

  }, 180);
}


// ======================================================
// TAP
// ======================================================

function setupTap() {

  if (tapInitialized) {
    return;
  }


  const target =
    $("tapArea");


  if (!target) {

    console.warn(
      "tapArea not found."
    );

    return;
  }


  tapInitialized = true;


  target.addEventListener(
    "click",
    (event) => {

      if (
        state.energy <= 0
      ) {

        return;
      }


      const power =
        Number(
          state.tapPower
        ) || 1;


      // -----------------------------------------------
      // Local instant update
      // -----------------------------------------------

      state.points +=
        power;


      state.energy =
        Math.max(
          0,
          state.energy - 1
        );


      state.lastEnergyTime =
        Date.now();


      saveState();

      renderBalance();


      // -----------------------------------------------
      // +1 / +2
      // -----------------------------------------------

      createTapEffect(
        event.clientX,
        event.clientY,
        power
      );


      // -----------------------------------------------
      // Logo movement
      // -----------------------------------------------

      animateLogo(
        event
      );


      // -----------------------------------------------
      // Backend
      // -----------------------------------------------

      sendTapToBackend(
        1
      );
    }
  );
}


// ======================================================
// ENERGY REGEN
// ======================================================

function startEnergyRegen() {

  if (energyStarted) {
    return;
  }


  energyStarted = true;


  setInterval(() => {

    if (
      state.energy <
      state.maxEnergy
    ) {

      state.energy =
        Math.min(
          state.maxEnergy,
          state.energy + 1
        );


      state.lastEnergyTime =
        Date.now();


      saveState();

      renderBalance();
    }

  }, 3000);
}


// ======================================================
// NAVIGATION
// ======================================================

function setupNavigation() {

  if (navigationInitialized) {
    return;
  }


  navigationInitialized = true;


  const buttons =
    document.querySelectorAll(
      "[data-page]"
    );


  const pages =
    document.querySelectorAll(
      ".page"
    );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const pageId =
            button.dataset.page;


          if (!pageId) {
            return;
          }


          pages.forEach(
            (page) => {

              page.classList.remove(
                "active"
              );
            }
          );


          const selectedPage =
            $(pageId);


          if (selectedPage) {

            selectedPage.classList.add(
              "active"
            );
          }


          buttons.forEach(
            (item) => {

              item.classList.remove(
                "active"
              );
            }
          );


          button.classList.add(
            "active"
          );
        }
      );
    }
  );
}


// ======================================================
// WALLET TOP BUTTON
// ======================================================

function setupWalletTop() {

  const button =
    $("walletTop");

  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      const walletPage =
        $("walletPage");

      const pages =
        document.querySelectorAll(
          ".page"
        );


      pages.forEach(
        (page) => {

          page.classList.remove(
            "active"
          );
        }
      );


      if (walletPage) {

        walletPage.classList.add(
          "active"
        );
      }


      document
        .querySelectorAll(
          ".nav-item"
        )
        .forEach(
          (item) => {

            item.classList.remove(
              "active"
            );

            if (
              item.dataset.page ===
              "walletPage"
            ) {

              item.classList.add(
                "active"
              );
            }
          }
        );
    }
  );
}


// ======================================================
// DOUBLE TAP BOOST
// ======================================================

function setupBoosts() {

  if (boostInitialized) {
    return;
  }


  boostInitialized = true;


  const button =
    $("doubleBoost");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      if (
        state.doubleBoost
      ) {

        return;
      }


      state.doubleBoost =
        true;

      state.tapPower =
        2;


      button.textContent =
        "ACTIVE";


      button.disabled =
        true;


      saveState();

      renderBalance();
    }
  );


  if (
    state.doubleBoost
  ) {

    button.textContent =
      "ACTIVE";

    button.disabled =
      true;
  }
}


// ======================================================
// DAILY BUTTON
// ======================================================

function setupDaily() {

  const button =
    $("daily");

  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      const today =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );


      const last =
        localStorage.getItem(
          "sinaps_daily"
        );


      if (
        last === today
      ) {

        button.textContent =
          "ALREADY CLAIMED";

        return;
      }


      state.points +=
        100;


      localStorage.setItem(
        "sinaps_daily",
        today
      );


      saveState();

      renderBalance();


      button.textContent =
        "CLAIMED +100";
    }
  );
}


// ======================================================
// REFERRAL
// ======================================================

function setupReferral() {

  const button =
    $("invite");

  const link =
    $("referralLink");


  if (!button) {
    return;
  }


  const username =
    telegramUser?.username ||
    "SNPCOINBot";


  const referral =
    `https://t.me/${username}?start=${telegramId || ""}`;


  if (link) {

    link.textContent =
      referral;
  }


  button.addEventListener(
    "click",
    async () => {

      try {

        await navigator.clipboard.writeText(
          referral
        );


        button.textContent =
          "COPIED ✓";


        setTimeout(() => {

          button.textContent =
            "COPY INVITE LINK";

        }, 1500);


      } catch (error) {

        console.warn(
          "Clipboard error:",
          error
        );
      }
    }
  );
}


// ======================================================
// START APP
// ======================================================

async function startApp() {

  console.log(
    "SINAPS APP STARTING..."
  );


  console.log(
    "Telegram ID:",
    telegramId
  );


  console.log(
    "Username:",
    telegramUsername
  );


  // ----------------------------------------------------
  // UI FIRST
  // ----------------------------------------------------

  renderUsername();

  renderBalance();

  renderWallet();


  // ----------------------------------------------------
  // INTERACTION
  // ----------------------------------------------------

  initTonConnect();

  setupDisconnectButton();

  setupTap();

  setupNavigation();

  setupWalletTop();

  setupBoosts();

  setupDaily();

  setupReferral();

  startEnergyRegen();


  // ----------------------------------------------------
  // BACKEND IN BACKGROUND
  // ----------------------------------------------------

  loadUser();

  loadSavedWallet();


  console.log(
    "SINAPS APP READY 🚀"
  );
}


// ======================================================
// START
// ======================================================

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startApp
  );

} else {

  startApp();
}
