// ==========================================
// SINAPS MINI APP
// ==========================================

const API =
  "https://sinaps-backend.onrender.com";

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#050816");
  tg.setBackgroundColor("#050816");
}

// ==========================================
// TELEGRAM USER
// ==========================================

const telegramUser =
  tg?.initDataUnsafe?.user || null;

const telegramId =
  telegramUser?.id || null;

const telegramUsername =
  telegramUser?.username ||
  telegramUser?.first_name ||
  "SINAPS User";

// ==========================================
// STATE
// ==========================================

const STORAGE_KEY =
  "sinaps_v3_state";

let state = {
  points: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  doubleBoost: false,
  lastEnergyTime: Date.now(),
  walletAddress: null
};

try {
  const saved =
    JSON.parse(
      localStorage.getItem(STORAGE_KEY)
    );

  if (saved) {
    state = {
      ...state,
      ...saved
    };
  }
} catch (e) {
  console.log(
    "Local state error:",
    e
  );
}

// ==========================================
// ELEMENTS
// ==========================================

const pointsEl =
  document.getElementById("points");

const energyCurrentEl =
  document.getElementById("energyCurrent");

const energyMaxEl =
  document.getElementById("energyMax");

const energyTextEl =
  document.getElementById("energyText");

const energyFillEl =
  document.getElementById("energyFill");

const levelEl =
  document.getElementById("level");

const tapPowerEl =
  document.getElementById("tapPower");

const usernameEl =
  document.getElementById("username");

const userAvatarEl =
  document.getElementById("userAvatar");

const walletTopEl =
  document.getElementById("walletTop");

const walletTitleEl =
  document.getElementById("walletTitle");

const walletAddressEl =
  document.getElementById("walletAddress");

const disconnectWalletEl =
  document.getElementById(
    "disconnectWallet"
  );

const floatersEl =
  document.getElementById("floaters");

const sLogoEl =
  document.getElementById("sLogo");

const tapAreaEl =
  document.getElementById("tapArea");

const statusEl =
  document.getElementById("status");

// ==========================================
// SAVE LOCAL STATE
// ==========================================

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}

// ==========================================
// USER UI
// ==========================================

function renderUser() {
  if (usernameEl) {
    usernameEl.textContent =
      telegramUsername;
  }

  if (userAvatarEl) {
    userAvatarEl.textContent =
      telegramUsername
        .charAt(0)
        .toUpperCase();
  }
}

// ==========================================
// FORMAT WALLET
// ==========================================

function shortWallet(address) {
  if (!address) {
    return "Connect";
  }

  if (address.length <= 14) {
    return address;
  }

  return (
    address.slice(0, 6) +
    "..." +
    address.slice(-6)
  );
}

// ==========================================
// WALLET UI
// ==========================================

function renderWallet() {
  const address =
    state.walletAddress;

  if (walletTopEl) {
    walletTopEl.textContent =
      address
        ? shortWallet(address)
        : "Connect";
  }

  if (walletTitleEl) {
    walletTitleEl.textContent =
      address
        ? "Wallet Connected"
        : "Wallet not connected";
  }

  if (walletAddressEl) {
    walletAddressEl.textContent =
      address
        ? address
        : "Connect your TON wallet to continue.";
  }

  if (disconnectWalletEl) {
    disconnectWalletEl.style.display =
      address
        ? "block"
        : "none";
  }
}

// ==========================================
// RENDER
// ==========================================

function render() {
  if (pointsEl) {
    pointsEl.textContent =
      Math.floor(state.points)
        .toLocaleString();
  }

  if (energyCurrentEl) {
    energyCurrentEl.textContent =
      Math.floor(state.energy);
  }

  if (energyMaxEl) {
    energyMaxEl.textContent =
      state.maxEnergy;
  }

  if (energyTextEl) {
    energyTextEl.textContent =
      Math.floor(state.energy);
  }

  if (levelEl) {
    const level =
      Math.floor(
        state.points / 1000
      ) + 1;

    levelEl.textContent =
      level;
  }

  if (tapPowerEl) {
    tapPowerEl.textContent =
      "x" + state.tapPower;
  }

  if (energyFillEl) {
    const percent =
      Math.max(
        0,
        Math.min(
          100,
          (state.energy /
            state.maxEnergy) *
            100
        )
      );

    energyFillEl.style.width =
      percent + "%";
  }

  renderWallet();
}

// ==========================================
// ENERGY REGENERATION
// ==========================================

function regenerateEnergy() {
  const now = Date.now();

  if (
    !state.lastEnergyTime
  ) {
    state.lastEnergyTime =
      now;

    return;
  }

  const elapsed =
    now -
    state.lastEnergyTime;

  // 1 energy every 3 seconds
  const recovered =
    Math.floor(
      elapsed / 3000
    );

  if (recovered <= 0) {
    return;
  }

  state.energy =
    Math.min(
      state.maxEnergy,
      state.energy +
        recovered
    );

  state.lastEnergyTime =
    now;

  saveState();
  render();
}

setInterval(
  regenerateEnergy,
  1000
);

// ==========================================
// LOAD USER FROM BACKEND
// ==========================================

async function loadUser() {
  if (!telegramId) {
    render();
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
        "User API failed"
      );
    }

    const user =
      await response.json();

    // Backend is source of truth
    state.points =
      Number(user.balance) || 0;

    state.energy =
      Number(user.energy) || 0;

    state.maxEnergy =
      Number(user.max_energy) ||
      1000;

    state.walletAddress =
      user.wallet_address ||
      state.walletAddress ||
      null;

    state.lastEnergyTime =
      Date.now();

    saveState();
    render();

  } catch (error) {
    console.error(
      "LOAD USER:",
      error
    );

    if (statusEl) {
      statusEl.textContent =
        "SINAPS";
    }

    render();
  }
}

// ==========================================
// SAVE WALLET TO BACKEND
// ==========================================

async function saveWalletToBackend(
  walletAddress
) {
  if (
    !telegramId ||
    !walletAddress
  ) {
    return false;
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

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Wallet save failed"
      );
    }

    state.walletAddress =
      data.wallet_address;

    saveState();
    renderWallet();

    return true;

  } catch (error) {
    console.error(
      "SAVE WALLET:",
      error
    );

    if (tg) {
      tg.showAlert(
        "Wallet connection could not be saved."
      );
    }

    return false;
  }
}

// ==========================================
// LOAD SAVED WALLET
// ==========================================

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
      return;
    }

    const data =
      await response.json();

    if (data.wallet_address) {
      state.walletAddress =
        data.wallet_address;

      saveState();
      renderWallet();
    }

  } catch (error) {
    console.error(
      "LOAD WALLET:",
      error
    );
  }
}

// ==========================================
// TAP
// ==========================================

async function sendTapToBackend(
  taps,
  power
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
            power: power
          })
        }
      );

    if (!response.ok) {
      return;
    }

    const user =
      await response.json();

    // Sync with server
    state.points =
      Number(user.balance);

    state.energy =
      Number(user.energy);

    state.maxEnergy =
      Number(user.max_energy) ||
      state.maxEnergy;

    state.lastEnergyTime =
      Date.now();

    saveState();
    render();

  } catch (error) {
    console.error(
      "TAP SYNC:",
      error
    );
  }
}

function createFloater(
  x,
  y,
  amount
) {
  if (!floatersEl) {
    return;
  }

  const floater =
    document.createElement("div");

  floater.className =
    "floater";

  floater.textContent =
    "+" + amount;

  floater.style.left =
    x + "px";

  floater.style.top =
    y + "px";

  floatersEl.appendChild(
    floater
  );

  setTimeout(() => {
    floater.remove();
  }, 900);
}

function rotateLogo(
  x,
  y
) {
  if (!sLogoEl || !tapAreaEl) {
    return;
  }

  const rect =
    tapAreaEl.getBoundingClientRect();

  const centerX =
    rect.width / 2;

  const centerY =
    rect.height / 2;

  const dx =
    x - centerX;

  const dy =
    y - centerY;

  const angle =
    Math.atan2(dy, dx) *
    (180 / Math.PI);

  const rotateY =
    Math.max(
      -25,
      Math.min(
        25,
        dx / 8
      )
    );

  const rotateX =
    Math.max(
      -20,
      Math.min(
        20,
        -dy / 8
      )
    );

  sLogoEl.style.transform =
    `perspective(700px)
     rotateY(${rotateY}deg)
     rotateX(${rotateX}deg)
     rotateZ(${angle / 30}deg)
     scale(1.04)`;

  clearTimeout(
    window.sinapsLogoTimer
  );

  window.sinapsLogoTimer =
    setTimeout(() => {
      sLogoEl.style.transform =
        "";
    }, 350);
}

function tapAt(
  clientX,
  clientY
) {
  regenerateEnergy();

  if (state.energy <= 0) {
    if (tg) {
      tg.HapticFeedback?.impactOccurred(
        "light"
      );
    }

    return;
  }

  const rect =
    tapAreaEl.getBoundingClientRect();

  const x =
    clientX - rect.left;

  const y =
    clientY - rect.top;

  const power =
    state.doubleBoost
      ? 2
      : state.tapPower;

  state.energy -= 1;

  state.points += power;

  state.lastEnergyTime =
    Date.now();

  createFloater(
    x,
    y,
    power
  );

  rotateLogo(
    x,
    y
  );

  tg?.HapticFeedback?.impactOccurred(
    "light"
  );

  saveState();
  render();

  sendTapToBackend(
    1,
    power
  );
}

// ==========================================
// TAP EVENTS
// ==========================================

if (tapAreaEl) {
  tapAreaEl.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();

      tapAt(
        event.clientX,
        event.clientY
      );
    },
    {
      passive: false
    }
  );
}

// ==========================================
// DOUBLE BOOST
// ==========================================

const doubleBoostBtn =
  document.getElementById(
    "doubleBoost"
  );

if (doubleBoostBtn) {
  doubleBoostBtn.addEventListener(
    "click",
    () => {
      state.doubleBoost =
        !state.doubleBoost;

      state.tapPower =
        state.doubleBoost
          ? 2
          : 1;

      doubleBoostBtn.textContent =
        state.doubleBoost
          ? "ACTIVE"
          : "ACTIVATE";

      saveState();
      render();
    }
  );
}

// ==========================================
// PAGE NAVIGATION
// ==========================================

const navItems =
  document.querySelectorAll(
    ".nav-item"
  );

const pages =
  document.querySelectorAll(
    ".page"
  );

function openPage(
  pageId
) {
  pages.forEach(
    (page) => {
      page.classList.toggle(
        "active",
        page.id === pageId
      );
    }
  );

  navItems.forEach(
    (item) => {
      item.classList.toggle(
        "active",
        item.dataset.page ===
          pageId
      );
    }
  );

  window.scrollTo(
    0,
    0
  );
}

navItems.forEach(
  (item) => {
    item.addEventListener(
      "click",
      () => {
        openPage(
          item.dataset.page
        );
      }
    );
  }
);

// ==========================================
// TOP WALLET BUTTON
// ==========================================

if (walletTopEl) {
  walletTopEl.addEventListener(
    "click",
    () => {
      openPage(
        "walletPage"
      );
    }
  );
}

// ==========================================
// TON CONNECT
// ==========================================

let tonConnectUI = null;

function initTonConnect() {
  if (
    typeof TON_CONNECT_UI ===
    "undefined"
  ) {
    console.error(
      "TON Connect UI not loaded"
    );

    return;
  }

  try {
    tonConnectUI =
      new TON_CONNECT_UI.TonConnectUI(
        {
          manifestUrl:
            "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json",

          buttonRootId:
            "ton-connect-button"
        }
      );

    tonConnectUI.onStatusChange(
      async (wallet) => {
        if (
          wallet &&
          wallet.account
        ) {
          const address =
            wallet.account.address;

          console.log(
            "Wallet connected:",
            address
          );

          state.walletAddress =
            address;

          saveState();
          renderWallet();

          await saveWalletToBackend(
            address
          );

        } else {
          console.log(
            "Wallet disconnected"
          );

          renderWallet();
        }
      }
    );

  } catch (error) {
    console.error(
      "TON CONNECT INIT:",
      error
    );
  }
}

// ==========================================
// DISCONNECT WALLET
// ==========================================

if (disconnectWalletEl) {
  disconnectWalletEl.addEventListener(
    "click",
    async () => {
      if (!tonConnectUI) {
        return;
      }

      try {
        await tonConnectUI.disconnect();

        if (telegramId) {
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
        }

        state.walletAddress =
          null;

        saveState();
        renderWallet();

        if (tg) {
          tg.showAlert(
            "Wallet disconnected."
          );
        }

      } catch (error) {
        console.error(
          "DISCONNECT:",
          error
        );
      }
    }
  );
}

// ==========================================
// WITHDRAW
// ==========================================

const withdrawBtn =
  document.getElementById(
    "withdrawBtn"
  );

if (withdrawBtn) {
  withdrawBtn.addEventListener(
    "click",
    () => {
      const amount =
        document.getElementById(
          "withdrawAmount"
        )?.value;

      if (!state.walletAddress) {
        tg?.showAlert(
          "Please connect your wallet first."
        );

        return;
      }

      if (
        !amount ||
        Number(amount) <= 0
      ) {
        tg?.showAlert(
          "Enter a valid SNP amount."
        );

        return;
      }

      tg?.showAlert(
        "SNP withdrawal will be enabled after the secure Jetton withdrawal system is connected."
      );
    }
  );
}

// ==========================================
// START
// ==========================================

renderUser();
render();
initTonConnect();
loadUser();
loadSavedWallet();
