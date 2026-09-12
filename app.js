const API = "https://sinaps-backend.onrender.com";

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
}

// ===============================
// TELEGRAM USER
// ===============================

const telegramUser =
  tg?.initDataUnsafe?.user || null;

const telegramId =
  telegramUser?.id || null;

const telegramUsername =
  telegramUser?.username ||
  telegramUser?.first_name ||
  "SINAPS User";

// ===============================
// DOM
// ===============================

const $ = (id) => document.getElementById(id);

// ===============================
// STATE
// ===============================

let state = {
  points: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  doubleBoost: false,
  lastEnergyTime: Date.now(),
  walletAddress: null
};

// ===============================
// LOAD LOCAL STATE
// ===============================

try {
  const saved =
    localStorage.getItem("sinaps_v1_state");

  if (saved) {
    state = {
      ...state,
      ...JSON.parse(saved)
    };
  }
} catch (error) {
  console.error(
    "Local state error:",
    error
  );
}

// ===============================
// SAVE STATE
// ===============================

function saveState() {
  try {
    localStorage.setItem(
      "sinaps_v1_state",
      JSON.stringify(state)
    );
  } catch (error) {
    console.error(
      "Save state error:",
      error
    );
  }
}

// ===============================
// FORMAT NUMBERS
// ===============================

function formatNumber(number) {
  return Number(number || 0).toLocaleString(
    "en-US"
  );
}

// ===============================
// UPDATE UI
// ===============================

function renderBalance() {
  const balance = $("balance");

  if (balance) {
    balance.textContent =
      formatNumber(state.points);
  }

  const energy = $("energy");

  if (energy) {
    energy.textContent =
      `${Math.floor(state.energy)} / ${state.maxEnergy}`;
  }

  const energyFill = $("energyFill");

  if (energyFill) {
    const percent =
      (state.energy / state.maxEnergy) * 100;

    energyFill.style.width =
      `${Math.max(0, Math.min(100, percent))}%`;
  }

  const power = $("tapPower");

  if (power) {
    power.textContent =
      `+${state.tapPower}`;
  }
}

// ===============================
// WALLET UI
// ===============================

function shortAddress(address) {
  if (!address) return "";

  if (address.length <= 16) {
    return address;
  }

  return (
    address.substring(0, 7) +
    "..." +
    address.substring(
      address.length - 6
    )
  );
}

function renderWallet() {
  const walletText =
    $("walletAddress");

  const walletTop =
    $("walletTop");

  if (state.walletAddress) {

    if (walletText) {
      walletText.textContent =
        shortAddress(
          state.walletAddress
        );
    }

    if (walletTop) {
      walletTop.textContent =
        shortAddress(
          state.walletAddress
        );
    }

  } else {

    if (walletText) {
      walletText.textContent =
        "Not Connected";
    }

    if (walletTop) {
      walletTop.textContent =
        "Connect Wallet";
    }
  }
}

// ===============================
// LOAD USER FROM BACKEND
// ===============================

async function loadUser() {

  if (!telegramId) {
    console.warn(
      "Telegram user ID not available"
    );

    renderBalance();
    renderWallet();

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

    const user =
      await response.json();

    console.log(
      "USER FROM BACKEND:",
      user
    );

    if (!response.ok) {
      console.error(
        "User load failed:",
        user
      );

      return;
    }

    state.points =
      Number(user.balance) || 0;

    state.energy =
      Number(user.energy) || 0;

    state.maxEnergy =
      Number(user.max_energy) ||
      1000;

    state.lastEnergyTime =
      Date.now();

    if (user.wallet_address) {
      state.walletAddress =
        user.wallet_address;
    }

    saveState();

    renderBalance();
    renderWallet();

  } catch (error) {

    console.error(
      "LOAD USER ERROR:",
      error
    );
  }
}

// ===============================
// SAVE WALLET TO BACKEND
// ===============================

async function saveWalletToBackend(
  walletAddress
) {

  if (!telegramId) {

    console.error(
      "Cannot save wallet: Telegram ID missing"
    );

    return false;
  }

  if (!walletAddress) {

    console.error(
      "Cannot save wallet: address missing"
    );

    return false;
  }

  try {

    console.log(
      "Saving wallet:",
      walletAddress
    );

    console.log(
      "Telegram ID:",
      telegramId
    );

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

    const result =
      await response.json();

    console.log(
      "WALLET SAVE RESPONSE:",
      result
    );

    if (!response.ok) {

      console.error(
        "Wallet save failed:",
        result
      );

      alert(
        result.error ||
        "Wallet could not be saved"
      );

      return false;
    }

    state.walletAddress =
      result.wallet_address ||
      walletAddress;

    saveState();
    renderWallet();

    console.log(
      "Wallet successfully saved to Supabase"
    );

    return true;

  } catch (error) {

    console.error(
      "SAVE WALLET ERROR:",
      error
    );

    return false;
  }
}

// ===============================
// LOAD SAVED WALLET
// ===============================

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

    const result =
      await response.json();

    console.log(
      "SAVED WALLET:",
      result
    );

    if (
      response.ok &&
      result.wallet_address
    ) {

      state.walletAddress =
        result.wallet_address;

      saveState();
      renderWallet();
    }

  } catch (error) {

    console.error(
      "LOAD WALLET ERROR:",
      error
    );
  }
}

// ===============================
// DISCONNECT WALLET
// ===============================

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

    const result =
      await response.json();

    console.log(
      "DISCONNECT RESPONSE:",
      result
    );

  } catch (error) {

    console.error(
      "DISCONNECT ERROR:",
      error
    );
  }
}

// ===============================
// TON CONNECT
// ===============================

let tonConnectUI = null;

function initTonConnect() {

  if (
    !window.TON_CONNECT_UI
  ) {

    console.error(
      "TON Connect UI library not loaded"
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

    console.log(
      "TON Connect initialized"
    );

    // ===============================
    // WALLET STATUS
    // ===============================

    tonConnectUI.onStatusChange(
      async (wallet) => {

        try {

          if (!wallet) {

            console.log(
              "Wallet disconnected"
            );

            state.walletAddress =
              null;

            saveState();
            renderWallet();

            return;
          }

          const address =
            wallet.account.address;

          console.log(
            "TON WALLET CONNECTED:",
            address
          );

          console.log(
            "TELEGRAM ID:",
            telegramId
          );

          state.walletAddress =
            address;

          saveState();
          renderWallet();

          // SAVE TO SUPABASE
          await saveWalletToBackend(
            address
          );

        } catch (error) {

          console.error(
            "WALLET STATUS ERROR:",
            error
          );
        }
      }
    );

  } catch (error) {

    console.error(
      "TON CONNECT INIT ERROR:",
      error
    );
  }
}

// ===============================
// DISCONNECT BUTTON
// ===============================

function setupDisconnectButton() {

  const button =
    $("disconnectWallet");

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    async () => {

      try {

        if (tonConnectUI) {

          await tonConnectUI.disconnect();
        }

        await disconnectWalletBackend();

        state.walletAddress =
          null;

        saveState();
        renderWallet();

      } catch (error) {

        console.error(
          "DISCONNECT BUTTON ERROR:",
          error
        );
      }
    }
  );
}

// ===============================
// TAP
// ===============================

async function sendTapToBackend(
  taps
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

    const result =
      await response.json();

    console.log(
      "TAP RESPONSE:",
      result
    );

    if (!response.ok) {
      return;
    }

    state.points =
      Number(result.balance) || 0;

    state.energy =
      Number(result.energy) || 0;

    state.maxEnergy =
      Number(result.max_energy) ||
      state.maxEnergy;

    state.lastEnergyTime =
      Date.now();

    saveState();

    renderBalance();

  } catch (error) {

    console.error(
      "TAP ERROR:",
      error
    );
  }
}

// ===============================
// TAP BUTTON
// ===============================

function setupTap() {

  const tapArea =
    $("tapArea") ||
    $("tapButton") ||
    $("coin");

  if (!tapArea) {
    console.warn(
      "Tap element not found"
    );

    return;
  }

  tapArea.addEventListener(
    "click",
    async (event) => {

      if (state.energy <= 0) {
        return;
      }

      const power =
        state.doubleBoost
          ? state.tapPower * 2
          : state.tapPower;

      state.energy =
        Math.max(
          0,
          state.energy - 1
        );

      state.points += power;

      saveState();
      renderBalance();

      // Visual +number
      const plus =
        document.createElement(
          "div"
        );

      plus.className =
        "tap-plus";

      plus.textContent =
        `+${power}`;

      plus.style.position =
        "fixed";

      plus.style.left =
        `${event.clientX}px`;

      plus.style.top =
        `${event.clientY}px`;

      plus.style.pointerEvents =
        "none";

      plus.style.zIndex =
        "9999";

      document.body.appendChild(
        plus
      );

      setTimeout(() => {

        plus.remove();

      }, 700);

      // Backend
      sendTapToBackend(1);
    }
  );
}

// ===============================
// ENERGY REGENERATION
// ===============================

function startEnergyRegen() {

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

// ===============================
// USERNAME
// ===============================

function renderUsername() {

  const username =
    $("username");

  if (username) {

    username.textContent =
      telegramUsername;
  }
}

// ===============================
// NAVIGATION
// ===============================

function setupNavigation() {

  const buttons =
    document.querySelectorAll(
      "[data-page]"
    );

  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const pageName =
            button.dataset.page;

          document
            .querySelectorAll(
              ".page"
            )
            .forEach(
              (page) => {

                page.classList.remove(
                  "active"
                );
              }
            );

          const page =
            $(pageName);

          if (page) {

            page.classList.add(
              "active"
            );
          }

          document
            .querySelectorAll(
              "[data-page]"
            )
            .forEach(
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

// ===============================
// START
// ===============================

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

  renderUsername();
  renderBalance();
  renderWallet();

  await loadUser();

  await loadSavedWallet();

  initTonConnect();

  setupDisconnectButton();

  setupTap();

  setupNavigation();

  startEnergyRegen();

  console.log(
    "SINAPS APP READY 🚀"
  );
}

// ===============================
// RUN
// ===============================

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
