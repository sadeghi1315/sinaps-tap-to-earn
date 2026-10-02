/* =========================================================
   SINAPS MINI APP
   Frontend Controller
========================================================= */

const API =
  "https://sinaps-backend.onrender.com";


/* =========================================================
   TELEGRAM
========================================================= */

const tg =
  window.Telegram &&
  window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;


if (tg) {

  try {

    tg.ready();

    if (typeof tg.expand === "function") {
      tg.expand();
    }

  } catch (error) {

    console.log(
      "Telegram initialization:",
      error
    );

  }

}


/* =========================================================
   TELEGRAM USER
========================================================= */

const telegramUser =
  tg &&
  tg.initDataUnsafe &&
  tg.initDataUnsafe.user
    ? tg.initDataUnsafe.user
    : null;


const telegramId =
  telegramUser &&
  telegramUser.id
    ? telegramUser.id
    : null;


const telegramUsername =
  telegramUser &&
  (
    telegramUser.username ||
    telegramUser.first_name
  )
    ? (
        telegramUser.username ||
        telegramUser.first_name
      )
    : "SINAPS User";


/* =========================================================
   DOM HELPER
========================================================= */

function $(id) {

  return document.getElementById(id);

}


/* =========================================================
   APP STATE
========================================================= */

let state = {

  points: 0,

  energy: 1000,

  maxEnergy: 1000,

  tapPower: 1,

  doubleBoost: false,

  walletAddress: null,

  lastEnergyTime: Date.now()

};


let tonConnectUI = null;


/* =========================================================
   LOCAL STORAGE
========================================================= */

function loadLocalState() {

  try {

    const saved =
      localStorage.getItem(
        "sinaps_v1_state"
      );


    if (saved) {

      const parsed =
        JSON.parse(saved);


      if (
        parsed &&
        typeof parsed === "object"
      ) {

        state = {
          ...state,
          ...parsed
        };

      }

    }

  } catch (error) {

    console.log(
      "Local state load error:",
      error
    );

  }


  state.points =
    Number.isFinite(
      Number(state.points)
    )
      ? Number(state.points)
      : 0;


  state.energy =
    Number.isFinite(
      Number(state.energy)
    )
      ? Number(state.energy)
      : 1000;


  state.maxEnergy =
    Number.isFinite(
      Number(state.maxEnergy)
    )
      ? Number(state.maxEnergy)
      : 1000;


  state.tapPower =
    Number.isFinite(
      Number(state.tapPower)
    )
      ? Number(state.tapPower)
      : 1;


  if (state.energy > state.maxEnergy) {
    state.energy = state.maxEnergy;
  }

}


/* =========================================================
   SAVE STATE
========================================================= */

function saveState() {

  try {

    localStorage.setItem(
      "sinaps_v1_state",
      JSON.stringify(state)
    );

  } catch (error) {

    console.log(
      "Local state save error:",
      error
    );

  }

}


/* =========================================================
   NUMBER FORMAT
========================================================= */

function formatNumber(value) {

  return Number(
    value || 0
  ).toLocaleString(
    "en-US"
  );

}


/* =========================================================
   SHORT WALLET ADDRESS
========================================================= */

function shortAddress(address) {

  if (!address) {
    return "";
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


/* =========================================================
   USERNAME
========================================================= */

function renderUsername() {

  const username =
    $("username");

  const avatar =
    $("userAvatar");


  if (username) {

    username.textContent =
      telegramUsername;

  }


  if (avatar) {

    avatar.textContent =
      (
        telegramUsername
          .charAt(0) ||
        "S"
      ).toUpperCase();

  }

}


/* =========================================================
   BALANCE RENDER
========================================================= */

function renderBalance() {

  const balance =
    $("balance");


  if (balance) {

    balance.textContent =
      formatNumber(
        state.points
      );

  }


  const level =
    $("level");


  if (level) {

    const calculatedLevel =
      Math.floor(
        Number(state.points) / 1000
      ) + 1;


    level.textContent =
      calculatedLevel;

  }


  const energy =
    $("energy");


  if (energy) {

    energy.textContent =
      Math.floor(
        state.energy
      ) +
      " / " +
      Math.floor(
        state.maxEnergy
      );

  }


  const energyCurrent =
    $("energyCurrent");


  if (energyCurrent) {

    energyCurrent.textContent =
      Math.floor(
        state.energy
      );

  }


  const energyMax =
    $("energyMax");


  if (energyMax) {

    energyMax.textContent =
      Math.floor(
        state.maxEnergy
      );

  }


  const energyFill =
    $("energyFill");


  if (energyFill) {

    const percent =
      state.maxEnergy > 0
        ? (
            state.energy /
            state.maxEnergy
          ) * 100
        : 0;


    energyFill.style.width =
      Math.max(
        0,
        Math.min(
          100,
          percent
        )
      ) + "%";

  }


  const tapPower =
    $("tapPower");


  if (tapPower) {

    tapPower.textContent =
      "x" +
      state.tapPower;

  }

}


/* =========================================================
   WALLET RENDER
========================================================= */

function renderWallet() {

  const title =
    $("walletTitle");

  const address =
    $("walletAddress");

  const topButton =
    $("walletTop");

  const disconnect =
    $("disconnectWallet");


  if (state.walletAddress) {

    if (title) {

      title.textContent =
        "Wallet Connected";

    }


    if (address) {

      address.textContent =
        shortAddress(
          state.walletAddress
        );

    }


    if (topButton) {

      topButton.textContent =
        shortAddress(
          state.walletAddress
        );

    }


    if (disconnect) {

      disconnect.style.display =
        "block";

    }

  } else {

    if (title) {

      title.textContent =
        "Wallet not connected";

    }


    if (address) {

      address.textContent =
        "Connect your TON wallet to continue.";

    }


    if (topButton) {

      topButton.textContent =
        "Connect";

    }


    if (disconnect) {

      disconnect.style.display =
        "none";

    }

  }

}


/* =========================================================
   PAGE SYSTEM
========================================================= */

function showPage(pageId) {

  const pages =
    document.querySelectorAll(
      ".page"
    );


  pages.forEach(
    function(page) {

      page.classList.remove(
        "active"
      );

    }
  );


  const selected =
    document.getElementById(
      pageId
    );


  if (selected) {

    selected.classList.add(
      "active"
    );

  }


  const navItems =
    document.querySelectorAll(
      ".nav-item"
    );


  navItems.forEach(
    function(item) {

      if (
        item.dataset.page ===
        pageId
      ) {

        item.classList.add(
          "active"
        );

      } else {

        item.classList.remove(
          "active"
        );

      }

    }
  );


  window.scrollTo(
    0,
    0
  );

}


/* =========================================================
   BOTTOM NAVIGATION
========================================================= */

function setupNavigation() {

  const navItems =
    document.querySelectorAll(
      ".nav-item"
    );


  console.log(
    "SINAPS navigation buttons:",
    navItems.length
  );


  navItems.forEach(
    function(item) {

      item.addEventListener(
        "click",
        function(event) {

          event.preventDefault();
          event.stopPropagation();


          const pageId =
            item.getAttribute(
              "data-page"
            );


          if (!pageId) {
            return;
          }


          showPage(
            pageId
          );

        }
      );

    }
  );

}


/* =========================================================
   TOP WALLET BUTTON
========================================================= */

function setupTopWallet() {

  const button =
    $("walletTop");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    function() {

      showPage(
        "walletPage"
      );

    }
  );

}


/* =========================================================
   TAP FLOATING NUMBER
========================================================= */

function createTapEffect(
  x,
  y,
  amount
) {

  const container =
    $("floaters");


  if (!container) {
    return;
  }


  const element =
    document.createElement(
      "div"
    );


  element.className =
    "floater";


  element.textContent =
    "+" +
    amount;


  /*
    tapArea is relative, therefore
    convert screen coordinates to
    local coordinates.
  */

  const rect =
    container.getBoundingClientRect();


  const localX =
    x -
    rect.left;


  const localY =
    y -
    rect.top;


  element.style.left =
    localX + "px";


  element.style.top =
    localY + "px";


  container.appendChild(
    element
  );


  setTimeout(
    function() {

      element.remove();

    },
    850
  );

}


/* =========================================================
   LOGO MOVEMENT
========================================================= */

function animateLogo(
  x,
  y
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
    x -
    centerX;


  const dy =
    y -
    centerY;


  const distance =
    Math.sqrt(
      dx * dx +
      dy * dy
    );


  if (
    !Number.isFinite(distance) ||
    distance === 0
  ) {

    return;

  }


  const maxMove =
    18;


  const move =
    Math.min(
      maxMove,
      distance * 0.06
    );


  const moveX =
    (dx / distance) *
    move;


  const moveY =
    (dy / distance) *
    move;


  const rotate =
    Math.atan2(
      dy,
      dx
    ) *
    (180 / Math.PI) *
    0.08;


  logo.style.transition =
    "transform .12s ease-out";


  logo.style.transform =
    "translate(" +
    moveX +
    "px, " +
    moveY +
    "px) rotate(" +
    rotate +
    "deg)";


  setTimeout(
    function() {

      logo.style.transition =
        "transform .35s ease-out";


      logo.style.transform =
        "translate(0,0) rotate(0deg)";

    },
    130
  );

}


/* =========================================================
   TAP
========================================================= */

function setupTap() {

  const tapArea =
    $("tapArea");


  if (!tapArea) {

    console.log(
      "SINAPS: tapArea not found"
    );

    return;
  }


  tapArea.addEventListener(
    "click",
    function(event) {

      if (
        Number(state.energy) <= 0
      ) {

        return;

      }


      const amount =
        state.doubleBoost
          ? state.tapPower * 2
          : state.tapPower;


      /*
        Update immediately.
        No Backend request can freeze
        the tap animation.
      */

      state.energy =
        Math.max(
          0,
          state.energy - 1
        );


      state.points +=
        amount;


      state.lastEnergyTime =
        Date.now();


      saveState();

      renderBalance();


      createTapEffect(
        event.clientX,
        event.clientY,
        amount
      );


      animateLogo(
        event.clientX,
        event.clientY
      );


      /*
        Backend runs separately.
      */

      sendTapToBackend(
        1
      );

    }
  );

}


/* =========================================================
   BACKEND TAP
========================================================= */

async function sendTapToBackend(
  taps
) {

  if (!telegramId) {
    return;
  }


  try {

    const response =
      await fetch(
        API +
        "/api/tap",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              {
                telegram_id:
                  telegramId,

                taps:
                  taps,

                power:
                  state.tapPower
              }
            )
        }
      );


    if (!response.ok) {

      throw new Error(
        "HTTP " +
        response.status
      );

    }


    const data =
      await response.json();


    console.log(
      "Tap backend:",
      data
    );


    /*
      Only use a backend balance
      if it is clearly returned.
    */

    if (
      data &&
      Number.isFinite(
        Number(
          data.balance
        )
      )
    ) {

      state.points =
        Number(
          data.balance
        );


      saveState();

      renderBalance();

    }

  } catch (error) {

    console.log(
      "Tap backend unavailable:",
      error
    );

  }

}


/* =========================================================
   ENERGY REGENERATION
========================================================= */

function startEnergyRegen() {

  setInterval(
    function() {

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

    },
    3000
  );

}


/* =========================================================
   BOOST
========================================================= */

function setupBoost() {

  const button =
    $("doubleBoost");


  if (!button) {
    return;
  }


  if (state.doubleBoost) {

    button.textContent =
      "ACTIVE";

    button.disabled =
      true;

  }


  button.addEventListener(
    "click",
    function() {

      if (
        state.doubleBoost
      ) {

        return;

      }


      state.doubleBoost =
        true;


      saveState();


      button.textContent =
        "ACTIVE";


      button.disabled =
        true;


      renderBalance();

    }
  );

}


/* =========================================================
   DAILY BONUS
========================================================= */

function setupDaily() {

  const button =
    $("daily");


  if (!button) {
    return;
  }


  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10
      );


  const claimed =
    localStorage.getItem(
      "sinaps_daily_date"
    );


  if (
    claimed === today
  ) {

    button.textContent =
      "CLAIMED";

    button.disabled =
      true;

  }


  button.addEventListener(
    "click",
    function() {

      const currentDate =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );


      const alreadyClaimed =
        localStorage.getItem(
          "sinaps_daily_date"
        );


      if (
        alreadyClaimed ===
        currentDate
      ) {

        return;

      }


      state.points +=
        100;


      localStorage.setItem(
        "sinaps_daily_date",
        currentDate
      );


      saveState();

      renderBalance();


      button.textContent =
        "CLAIMED";


      button.disabled =
        true;

    }
  );

}


/* =========================================================
   REFERRAL
========================================================= */

function setupReferral() {

  const button =
    $("invite");

  const linkBox =
    $("referralLink");


  if (!button) {
    return;
  }


  const userCode =
    telegramId ||
    "user";


  const link =
    "https://t.me/SNPCOINBot?start=" +
    userCode;


  if (linkBox) {

    linkBox.textContent =
      link;

  }


  button.addEventListener(
    "click",
    async function() {

      try {

        if (
          navigator.clipboard &&
          navigator.clipboard.writeText
        ) {

          await navigator.clipboard.writeText(
            link
          );

          button.textContent =
            "COPIED ✓";

        } else {

          button.textContent =
            "COPY LINK";

        }

      } catch (error) {

        console.log(
          "Clipboard error:",
          error
        );

      }


      setTimeout(
        function() {

          button.textContent =
            "COPY INVITE LINK";

        },
        1500
      );

    }
  );

}


/* =========================================================
   TON CONNECT
========================================================= */

function initTonConnect() {

  /*
    Do not allow TON Connect to
    break the rest of the application.
  */

  if (
    !window.TON_CONNECT_UI ||
    !window.TON_CONNECT_UI.TonConnectUI
  ) {

    console.log(
      "TON Connect library unavailable."
    );

    return;

  }


  try {

    tonConnectUI =
      new window.TON_CONNECT_UI.TonConnectUI(
        {
          manifestUrl:
            "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json",

          buttonRootId:
            "ton-connect-button"
        }
      );


    tonConnectUI.onStatusChange(
      async function(wallet) {

        try {

          if (
            wallet &&
            wallet.account &&
            wallet.account.address
          ) {

            state.walletAddress =
              wallet.account.address;


            saveState();

            renderWallet();


            await saveWalletToBackend(
              state.walletAddress
            );

          } else {

            state.walletAddress =
              null;


            saveState();

            renderWallet();

          }

        } catch (error) {

          console.log(
            "Wallet status error:",
            error
          );

        }

      }
    );


  } catch (error) {

    console.log(
      "TON Connect initialization failed:",
      error
    );

  }

}


/* =========================================================
   SAVE WALLET BACKEND
========================================================= */

async function saveWalletToBackend(
  address
) {

  if (
    !telegramId ||
    !address
  ) {

    return;

  }


  try {

    const response =
      await fetch(
        API +
        "/api/wallet/connect",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              {
                telegram_id:
                  telegramId,

                wallet_address:
                  address
              }
            )
        }
      );


    if (!response.ok) {

      throw new Error(
        "HTTP " +
        response.status
      );

    }


    console.log(
      "Wallet saved."
    );

  } catch (error) {

    console.log(
      "Wallet save failed:",
      error
    );

  }

}


/* =========================================================
   LOAD WALLET FROM BACKEND
========================================================= */

async function loadSavedWallet() {

  if (!telegramId) {
    return;
  }


  try {

    const response =
      await fetch(
        API +
        "/api/wallet/get",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              {
                telegram_id:
                  telegramId
              }
            )
        }
      );


    if (!response.ok) {

      throw new Error(
        "HTTP " +
        response.status
      );

    }


    const data =
      await response.json();


    if (
      data &&
      data.wallet_address
    ) {

      state.walletAddress =
        data.wallet_address;


      saveState();

      renderWallet();

    }

  } catch (error) {

    console.log(
      "Saved wallet unavailable:",
      error
    );

  }

}


/* =========================================================
   DISCONNECT
========================================================= */

function setupDisconnect() {

  const button =
    $("disconnectWallet");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    async function() {

      try {

        if (tonConnectUI) {

          await tonConnectUI.disconnect();

        }

      } catch (error) {

        console.log(
          "TON disconnect:",
          error
        );

      }


      state.walletAddress =
        null;


      saveState();

      renderWallet();


      disconnectWalletBackend();

    }
  );

}


/* =========================================================
   DISCONNECT BACKEND
========================================================= */

async function disconnectWalletBackend() {

  if (!telegramId) {
    return;
  }


  try {

    await fetch(
      API +
      "/api/wallet/disconnect",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(
            {
              telegram_id:
                telegramId
            }
          )
      }
    );

  } catch (error) {

    console.log(
      "Backend disconnect:",
      error
    );

  }

}


/* =========================================================
   LOAD USER FROM BACKEND
========================================================= */

async function loadUser() {

  if (!telegramId) {
    return;
  }


  try {

    const response =
      await fetch(
        API +
        "/api/user",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              {
                telegram_id:
                  telegramId,

                username:
                  telegramUsername
              }
            )
        }
      );


    if (!response.ok) {

      throw new Error(
        "HTTP " +
        response.status
      );

    }


    const data =
      await response.json();


    console.log(
      "User backend:",
      data
    );


    /*
      Only update fields that
      actually exist.
    */

    if (
      data &&
      Number.isFinite(
        Number(
          data.balance
        )
      )
    ) {

      state.points =
        Number(
          data.balance
        );

    }


    if (
      data &&
      Number.isFinite(
        Number(
          data.energy
        )
      )
    ) {

      state.energy =
        Number(
          data.energy
        );

    }


    if (
      data &&
      Number.isFinite(
        Number(
          data.max_energy
        )
      )
    ) {

      state.maxEnergy =
        Number(
          data.max_energy
        );

    }


    if (
      state.energy >
      state.maxEnergy
    ) {

      state.energy =
        state.maxEnergy;

    }


    saveState();

    renderBalance();

  } catch (error) {

    /*
      Backend failure must NEVER
      freeze the Mini App.
    */

    console.log(
      "User backend unavailable:",
      error
    );

  }

}


/* =========================================================
   WITHDRAW BUTTON
========================================================= */

function setupWithdraw() {

  const button =
    $("withdrawBtn");

  const input =
    $("withdrawAmount");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    function() {

      const amount =
        Number(
          input &&
          input.value
            ? input.value
            : 0
        );


      if (
        !state.walletAddress
      ) {

        alert(
          "Please connect your TON wallet first."
        );

        return;

      }


      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {

        alert(
          "Enter a valid SNP amount."
        );

        return;

      }


      if (
        amount >
        state.points
      ) {

        alert(
          "Insufficient SNP balance."
        );

        return;

      }


      /*
        Actual withdrawal is intentionally
        not performed here yet.

        The secure production flow should:
        1. Pay 0.1 TON.
        2. Verify the exact payment server-side.
        3. Backend sends SNP from treasury.
      */

      alert(
        "Withdrawal system is being prepared. Your SNP balance has not been changed."
      );

    }
  );

}


/* =========================================================
   APP START
========================================================= */

function startApp() {

  console.log(
    "SINAPS STARTING..."
  );


  /*
    1. Load local data first.
  */

  loadLocalState();


  /*
    2. Render immediately.
  */

  renderUsername();

  renderBalance();

  renderWallet();


  /*
    3. Activate UI immediately.
  */

  setupNavigation();

  setupTopWallet();

  setupTap();

  setupBoost();

  setupDaily();

  setupReferral();

  setupDisconnect();

  setupWithdraw();

  startEnergyRegen();


  /*
    4. TON Connect.
  */

  initTonConnect();


  /*
    5. Backend in background.
    None of these are awaited.
  */

  loadUser();

  loadSavedWallet();


  console.log(
    "SINAPS READY 🚀"
  );

}


/* =========================================================
   SAFE START
========================================================= */

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
