const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#030914");
    tg.setBackgroundColor("#030914");
  } catch (e) {}
}


const API =
  "https://sinaps-backend.onrender.com";


const tgUser =
  tg?.initDataUnsafe?.user || null;


const telegramId =
  tgUser?.id || null;


const username =
  tgUser?.username ||
  tgUser?.first_name ||
  "SINAPS User";


const KEY =
  "sinaps_v3_state";


const defaultState = {

  points: 0,

  energy: 1000,

  maxEnergy: 1000,

  tapPower: 1,

  doubleBoost: false,

  lastEnergyTime: Date.now()

};


let state =
  JSON.parse(
    localStorage.getItem(KEY) || "null"
  ) || defaultState;


function $(id) {
  return document.getElementById(id);
}


function save() {

  localStorage.setItem(
    KEY,
    JSON.stringify(state)
  );

}


/* =========================
   ENERGY
========================= */

function regenerateEnergy() {

  const now =
    Date.now();

  const last =
    Number(
      state.lastEnergyTime ||
      now
    );


  const elapsed =
    Math.floor(
      (now - last) / 3000
    );


  if (
    elapsed <= 0
  ) {
    return;
  }


  if (
    state.energy <
    state.maxEnergy
  ) {

    state.energy =
      Math.min(
        state.maxEnergy,
        state.energy + elapsed
      );

  }


  state.lastEnergyTime =
    last + elapsed * 3000;


  save();

}


function render() {

  regenerateEnergy();


  if ($("points")) {

    $("points").textContent =
      Number(
        state.points
      ).toLocaleString();

  }


  if ($("level")) {

    $("level").textContent =
      Math.floor(
        Number(state.points) / 1000
      ) + 1;

  }


  if ($("energyText")) {

    $("energyText").textContent =
      Math.floor(
        state.energy
      );

  }


  if ($("energyCurrent")) {

    $("energyCurrent").textContent =
      Math.floor(
        state.energy
      );

  }


  if ($("energyMax")) {

    $("energyMax").textContent =
      Math.floor(
        state.maxEnergy
      );

  }


  if ($("energyFill")) {

    const percent =
      state.maxEnergy > 0
        ? (
            state.energy /
            state.maxEnergy
          ) * 100
        : 0;


    $("energyFill").style.width =
      Math.max(
        0,
        Math.min(
          100,
          percent
        )
      ) + "%";

  }


  if ($("tapPower")) {

    $("tapPower").textContent =
      "x" +
      state.tapPower;

  }


  if ($("doubleBoost")) {

    if (
      state.doubleBoost
    ) {

      $("doubleBoost").textContent =
        "ACTIVE";

      $("doubleBoost")
        .classList.add("active");

    } else {

      $("doubleBoost").textContent =
        "ACTIVATE";

      $("doubleBoost")
        .classList.remove("active");

    }

  }


  if ($("username")) {

    $("username").textContent =
      tgUser?.username
        ? "@" + tgUser.username
        : username;

  }


  if ($("userAvatar")) {

    $("userAvatar").textContent =
      (
        tgUser?.first_name ||
        username ||
        "S"
      )
      .charAt(0)
      .toUpperCase();

  }

}


let pendingTaps = 0;

let syncing = false;


/* =========================
   TAP
========================= */

function tapAt(x, y) {

  if (!telegramId) {

    alert(
      "Please open SINAPS inside Telegram."
    );

    return;

  }


  regenerateEnergy();


  if (
    state.energy <= 0
  ) {

    return;

  }


  const power =
    state.doubleBoost
      ? 2
      : 1;


  state.points +=
    power;


  state.energy -=
    1;


  state.lastEnergyTime =
    Date.now();


  pendingTaps += 1;


  render();

  save();


  /* FLOAT NUMBER */

  const floater =
    document.createElement("div");


  floater.className =
    "floater";


  floater.textContent =
    "+" + power;


  floater.style.left =
    x + "px";


  floater.style.top =
    y + "px";


  if ($("floaters")) {

    $("floaters")
      .appendChild(floater);


    setTimeout(
      () => floater.remove(),
      850
    );

  }


  /* S ROTATION */

  const s =
    $("sLogo");


  if (s) {

    const area =
      $("tapArea")
        .getBoundingClientRect();


    const centerX =
      area.width / 2;


    const centerY =
      area.height / 2;


    const dx =
      x - centerX;


    const dy =
      y - centerY;


    const angle =
      Math.atan2(
        dy,
        dx
      ) *
      180 /
      Math.PI;


    s.style.transform =
      `rotateY(${angle}deg) rotateX(${(-dy / 12)}deg)`;

  }


  try {

    tg?.HapticFeedback
      ?.impactOccurred("light");

  } catch (e) {}


  syncTaps();

}


const tapArea =
  $("tapArea");


if (tapArea) {

  tapArea.addEventListener(
    "pointerdown",
    function(e) {

      e.preventDefault();


      const rect =
        tapArea.getBoundingClientRect();


      const x =
        e.clientX -
        rect.left;


      const y =
        e.clientY -
        rect.top;


      tapAt(
        x,
        y
      );

    },
    {
      passive: false
    }
  );

}


/* =========================
   SYNC TAP
========================= */

async function syncTaps() {

  if (syncing) {
    return;
  }


  if (
    !telegramId ||
    pendingTaps <= 0
  ) {

    return;

  }


  syncing = true;


  const amount =
    Math.min(
      pendingTaps,
      50
    );


  const power =
    state.doubleBoost
      ? 2
      : 1;


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

          body:
            JSON.stringify({

              telegram_id:
                telegramId,

              taps:
                amount,

              power:
                power

            })

        }
      );


    const result =
      await response.json();


    if (
      !response.ok
    ) {

      console.error(
        "Tap sync error:",
        result
      );

      syncing = false;

      setTimeout(
        syncTaps,
        1000
      );

      return;

    }


    const accepted =
      Number(
        result.accepted_taps ||
        amount
      );


    pendingTaps =
      Math.max(
        0,
        pendingTaps -
        accepted
      );


    if (
      result.balance !== undefined
    ) {

      state.points =
        Number(
          result.balance
        );

    }


    if (
      result.energy !== undefined
    ) {

      state.energy =
        Number(
          result.energy
        );

    }


    if (
      result.max_energy !== undefined
    ) {

      state.maxEnergy =
        Number(
          result.max_energy
        );

    }


    state.lastEnergyTime =
      Date.now();


    save();

    render();


  } catch (error) {

    console.error(
      "Tap network error:",
      error
    );

    setTimeout(
      syncTaps,
      1500
    );

  }


  syncing = false;


  if (
    pendingTaps > 0
  ) {

    setTimeout(
      syncTaps,
      100
    );

  }

}


/* =========================
   LOAD USER
========================= */

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

          body:
            JSON.stringify({

              telegram_id:
                telegramId,

              username:
                username

            })

        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        "User API error"
      );

    }


    const user =
      await response.json();


    state.points =
      Number(
        user.balance || 0
      );


    state.energy =
      Number(
        user.energy ?? 1000
      );


    state.maxEnergy =
      Number(
        user.max_energy || 1000
      );


    state.lastEnergyTime =
      Date.now();


    save();

    render();


  } catch (error) {

    console.error(
      "Load user failed:",
      error
    );

    render();

  }

}


/* =========================
   BOOST
========================= */

if ($("doubleBoost")) {

  $("doubleBoost").onclick =
    function() {

      if (
        state.doubleBoost
      ) {

        return;

      }


      state.doubleBoost =
        true;


      state.tapPower =
        2;


      save();

      render();


      alert(
        "⚡ DOUBLE TAP ACTIVATED!\n\nEvery tap now gives +2 SNP."
      );

    };

}


if ($("energyBoost")) {

  $("energyBoost").onclick =
    function() {

      alert(
        "Energy Boost is coming soon."
      );

    };

}


/* =========================
   DAILY
========================= */

if ($("daily")) {

  $("daily").onclick =
    async function() {

      if (!telegramId) {

        alert(
          "Please open SINAPS inside Telegram."
        );

        return;

      }


      try {

        const response =
          await fetch(
            `${API}/api/daily`,
            {

              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({

                  telegram_id:
                    telegramId

                })

            }
          );


        const result =
          await response.json();


        if (
          !response.ok
        ) {

          alert(
            result.error ||
            "Daily bonus failed."
          );

          return;

        }


        state.points =
          Number(
            result.balance
          );


        save();

        render();


        alert(
          "+" +
          Number(
            result.bonus
          ) +
          " SNP claimed! 🎁"
        );


      } catch (error) {

        console.error(error);

        alert(
          "Connection error."
        );

      }

    };

}


/* =========================
   REFERRAL
========================= */

if ($("invite")) {

  $("invite").onclick =
    async function() {

      const id =
        telegramId ||
        "demo";


      const link =
        "https://t.me/SNPCOINBot?startapp=ref_" +
        id;


      if ($("referralLink")) {

        $("referralLink")
          .textContent =
          link;

      }


      try {

        await navigator.clipboard
          .writeText(link);


        alert(
          "Referral link copied! 👥"
        );

      } catch (e) {

        alert(link);

      }

    };

}


/* =========================
   NAVIGATION
========================= */

const pages =
  document.querySelectorAll(
    ".page"
  );


const navItems =
  document.querySelectorAll(
    ".nav-item"
  );


function showPage(id) {

  pages.forEach(
    page => {

      page.classList.remove(
        "active"
      );

      page.style.display =
        "none";

    }
  );


  navItems.forEach(
    item => {

      item.classList.remove(
        "active"
      );

    }
  );


  const page =
    document.getElementById(id);


  if (page) {

    page.classList.add(
      "active"
    );

    page.style.display =
      "block";

  }


  navItems.forEach(
    item => {

      if (
        item.dataset.page === id
      ) {

        item.classList.add(
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


navItems.forEach(
  item => {

    item.addEventListener(
      "click",
      function() {

        showPage(
          item.dataset.page
        );

      }
    );

  }
);


/* =========================
   TON CONNECT
========================= */

let tonConnectUI = null;


function shortAddress(address) {

  if (!address) {
    return "";
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


async function setupWallet() {

  if (
    !window.TON_CONNECT_UI
  ) {

    console.error(
      "TON Connect UI not loaded"
    );

    return;

  }


  try {

    tonConnectUI =
      new TON_CONNECT_UI.TonConnectUI({

        manifestUrl:
          "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json"

      });


    tonConnectUI.onStatusChange(
      function(wallet) {

        updateWalletUI(
          wallet
        );

      }
    );


    const restored =
      await tonConnectUI
        .connectionRestored;


    updateWalletUI(
      tonConnectUI.wallet
    );


  } catch (error) {

    console.error(
      "TON Connect error:",
      error
    );

  }

}


function updateWalletUI(wallet) {

  const top =
    $("walletTop");

  const title =
    $("walletTitle");

  const address =
    $("walletAddress");

  const disconnect =
    $("disconnectWallet");


  if (
    wallet &&
    wallet.account
  ) {

    const addr =
      wallet.account.address;


    if (top) {

      top.textContent =
        shortAddress(addr);

    }


    if (title) {

      title.textContent =
        "Wallet Connected";

    }


    if (address) {

      address.textContent =
        shortAddress(addr);

    }


    if (disconnect) {

      disconnect.style.display =
        "block";

    }

  } else {

    if (top) {

      top.textContent =
        "Connect";

    }


    if (title) {

      title.textContent =
        "Wallet not connected";

    }


    if (address) {

      address.textContent =
        "Connect your TON wallet to continue.";

    }


    if (disconnect) {

      disconnect.style.display =
        "none";

    }

  }

}


if ($("walletTop")) {

  $("walletTop").onclick =
    async function() {

      showPage(
        "walletPage"
      );


      if (
        tonConnectUI
      ) {

        tonConnectUI
          .openModal();

      }

    };

}


if ($("disconnectWallet")) {

  $("disconnectWallet").onclick =
    async function() {

      if (
        tonConnectUI
      ) {

        await tonConnectUI
          .disconnect();

      }

    };

}


/* =========================
   WITHDRAW
========================= */

if ($("withdrawBtn")) {

  $("withdrawBtn").onclick =
    function() {

      if (
        !tonConnectUI ||
        !tonConnectUI.connected
      ) {

        alert(
          "Please connect your TON wallet first."
        );

        return;

      }


      alert(
        "SNP withdrawal will be enabled after the Jetton withdrawal system is connected."
      );

    };

}


/* =========================
   START
========================= */

render();

loadUser();

setupWallet();


setInterval(
  render,
  1000
);
