const API = "https://sinaps-backend.onrender.com";

const tg = window.Telegram?.WebApp;

if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {
    console.warn("Telegram WebApp init error:", e);
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

const $ = (id) => document.getElementById(id);


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
let tonConnectInitialized = false;
let tapInitialized = false;
let navigationInitialized = false;
let energyRegenStarted = false;


// ======================================================
// LOAD LOCAL STATE
// ======================================================

try {
  const saved =
    localStorage.getItem("sinaps_v1_state");

  if (saved) {
    const parsed = JSON.parse(saved);

    state = {
      ...state,
      ...parsed
    };
  }
} catch (error) {
  console.warn(
    "Local state load error:",
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
      "Local state save error:",
      error
    );
  }
}


// ======================================================
// NUMBER FORMAT
// ======================================================

function formatNumber(number) {
  number = Number(number) || 0;

  return Math.floor(number).toLocaleString("en-US");
}


// ======================================================
// BALANCE RENDER
// ======================================================

function renderBalance() {

  const balance = $("balance");
  const energy = $("energy");
  const energyFill = $("energyFill");
  const tapPower = $("tapPower");

  if (balance) {
    balance.textContent =
      formatNumber(state.points);
  }

  if (energy) {
    energy.textContent =
      `${Math.floor(state.energy)} / ${Math.floor(state.maxEnergy)}`;
  }

  if (energyFill) {

    const percent =
      state.maxEnergy > 0
        ? (state.energy / state.maxEnergy) * 100
        : 0;

    energyFill.style.width =
      `${Math.max(0, Math.min(100, percent))}%`;
  }

  if (tapPower) {
    tapPower.textContent =
      `+${state.tapPower}`;
  }
}


// ======================================================
// WALLET SHORT ADDRESS
// ======================================================

function shortAddress(address) {

  if (!address) {
    return "Not connected";
  }

  if (address.length <= 16) {
    return address;
  }

  return (
    address.substring(0, 6) +
    "..." +
    address.substring(address.length - 6)
  );
}


// ======================================================
// WALLET RENDER
// ======================================================

function renderWallet() {

  const walletAddress =
    $("walletAddress");

  const walletTop =
    $("walletTop");

  if (walletAddress) {
    walletAddress.textContent =
      shortAddress(state.walletAddress);
  }

  if (walletTop) {
    walletTop.textContent =
      shortAddress(state.walletAddress);
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

  if (
    telegramUser?.username
  ) {
    username.textContent =
      "@" + telegramUser.username;
  } else if (
    telegramUser?.first_name
  ) {
    username.textContent =
      telegramUser.first_name;
  } else {
    username.textContent =
      "SINAPS User";
  }
}


// ======================================================
// LOAD USER FROM BACKEND
// ======================================================

async function loadUser() {

  if (!telegramId) {
    console.warn(
      "Telegram ID not available."
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
      data &&
      typeof data === "object"
    ) {

      if (
        data.balance !== undefined
      ) {
        state.points =
          Number(data.balance) || 0;
      }

      if (
        data.energy !== undefined
      ) {
        state.energy =
          Number(data.energy);
      }

      if (
        data.max_energy !== undefined
      ) {
        state.maxEnergy =
          Number(data.max_energy);
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
    }

    console.log(
      "User loaded:",
      data
    );

  } catch (error) {

    console.warn(
      "Backend user load failed:",
      error
    );

    // مهم:
    // برنامه متوقف نمی‌شود.
    // Mini App همچنان قابل استفاده است.
  }
}


// ======================================================
// SAVE WALLET TO BACKEND
// ======================================================

async function saveWalletToBackend(
  walletAddress
) {

  if (!telegramId) {
    console.warn(
      "Telegram ID missing."
    );

    return;
  }

  if (!walletAddress) {
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

    console.log(
      "Wallet saved:",
      data
    );

    if (
      data?.wallet_address
    ) {

      state.walletAddress =
        data.wallet_address;

    } else {

      state.walletAddress =
        walletAddress;
    }

    saveState();
    renderWallet();

  } catch (error) {

    console.error(
      "Wallet save failed:",
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

    console.log(
      "Saved wallet:",
      data
    );

  } catch (error) {

    console.warn(
      "Saved wallet load failed:",
      error
    );
  }
}


// ======================================================
// DISCONNECT WALLET BACKEND
// ======================================================

async function disconnectWalletBackend() {

  if (!telegramId) {
    return;
  }

  try {

    const response =
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

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    console.log(
      "Wallet disconnected from backend."
    );

  } catch (error) {

    console.warn(
      "Backend disconnect failed:",
      error
    );
  }
}


// ======================================================
// TON CONNECT
// ======================================================

function initTonConnect() {

  if (tonConnectInitialized) {
    return;
  }

  if (
    typeof TON_CONNECT_UI ===
    "undefined"
  ) {

    console.warn(
      "TON_CONNECT_UI library not loaded."
    );

    return;
  }

  const button =
    $("ton-connect-button");

  if (!button) {

    console.warn(
      "ton-connect-button not found."
    );

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

    tonConnectInitialized = true;

    console.log(
      "TON Connect initialized."
    );


    // --------------------------------------------------
    // Wallet status change
    // --------------------------------------------------

    tonConnectUI.onStatusChange(
      async (wallet) => {

        try {

          if (wallet) {

            const address =
              wallet.account?.address ||
              null;

            if (address) {

              state.walletAddress =
                address;

              saveState();

              renderWallet();

              await saveWalletToBackend(
                address
              );

              console.log(
                "Wallet connected:",
                address
              );
            }

          } else {

            state.walletAddress =
              null;

            saveState();

            renderWallet();

            console.log(
              "Wallet disconnected."
            );
          }

        } catch (error) {

          console.error(
            "Wallet status error:",
            error
          );
        }
      }
    );

  } catch (error) {

    console.error(
      "TON Connect initialization failed:",
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
    button.dataset.initialized === "true"
  ) {
    return;
  }

  button.dataset.initialized =
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
// SEND TAP TO BACKEND
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

            taps: taps,

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

    if (
      data &&
      typeof data === "object"
    ) {

      if (
        data.balance !== undefined
      ) {
        state.points =
          Number(data.balance);
      }

      if (
        data.energy !== undefined
      ) {
        state.energy =
          Number(data.energy);
      }

      if (
        data.max_energy !== undefined
      ) {
        state.maxEnergy =
          Number(data.max_energy);
      }

      state.lastEnergyTime =
        Date.now();

      saveState();

      renderBalance();
    }

  } catch (error) {

    console.warn(
      "Tap backend failed:",
      error
    );

    // Tap روی UI همچنان کار می‌کند.
  }
}


// ======================================================
// TAP EFFECT
// ======================================================

function createTapEffect(
  x,
  y,
  amount
) {

  const tap =
    document.createElement("div");

  tap.className =
    "tap-plus";

  tap.textContent =
    `+${amount}`;

  tap.style.position =
    "fixed";

  tap.style.left =
    `${x}px`;

  tap.style.top =
    `${y}px`;

  tap.style.pointerEvents =
    "none";

  tap.style.zIndex =
    "99999";

  document.body.appendChild(
    tap
  );

  requestAnimationFrame(() => {

    tap.classList.add(
      "show"
    );
  });

  setTimeout(() => {

    tap.remove();

  }, 900);
}


// ======================================================
// TAP
// ======================================================

function setupTap() {

  if (tapInitialized) {
    return;
  }

  const tapArea =
    $("tapArea");

  const tapButton =
    $("tapButton");

  const coin =
    $("coin");

  const target =
    tapArea ||
    tapButton ||
    coin;

  if (!target) {

    console.warn(
      "Tap target not found."
    );

    return;
  }

  tapInitialized = true;


  target.addEventListener(
    "click",
    async (event) => {

      if (state.energy <= 0) {

        return;
      }


      const power =
        Number(state.tapPower) || 1;


      // ----------------------------------------------
      // Instant local update
      // ----------------------------------------------

      state.energy =
        Math.max(
          0,
          state.energy - 1
        );

      state.points +=
        power;

      state.lastEnergyTime =
        Date.now();


      saveState();
      renderBalance();


      // ----------------------------------------------
      // +1 / +2 effect
      // ----------------------------------------------

      createTapEffect(
        event.clientX,
        event.clientY,
        power
      );


      // ----------------------------------------------
      // Send to backend
      // ----------------------------------------------

      sendTapToBackend(1);
    }
  );


  // Prevent unwanted double behavior
  target.addEventListener(
    "touchstart",
    () => {},
    {
      passive: true
    }
  );
}


// ======================================================
// ENERGY REGEN
// ======================================================

function startEnergyRegen() {

  if (energyRegenStarted) {
    return;
  }

  energyRegenStarted = true;


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


          // ----------------------------------------
          // Hide pages
          // ----------------------------------------

          pages.forEach(
            (page) => {

              page.classList.remove(
                "active"
              );
            }
          );


          // ----------------------------------------
          // Show selected page
          // ----------------------------------------

          const page =
            $(pageId);

          if (page) {

            page.classList.add(
              "active"
            );
          }


          // ----------------------------------------
          // Active nav button
          // ----------------------------------------

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


  // ==================================================
  // RENDER IMMEDIATELY
  // ==================================================

  renderUsername();

  renderBalance();

  renderWallet();


  // ==================================================
  // START INTERACTIVE FEATURES IMMEDIATELY
  // ==================================================

  initTonConnect();

  setupDisconnectButton();

  setupTap();

  setupNavigation();

  startEnergyRegen();


  // ==================================================
  // BACKEND IN BACKGROUND
  // ==================================================

  loadUser();

  loadSavedWallet();


  console.log(
    "SINAPS APP READY 🚀"
  );
}


// ======================================================
// RUN
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
