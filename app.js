const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "https://sinaps-backend.onrender.com";

const tgUser =
  tg?.initDataUnsafe?.user || null;

const telegramId =
  tgUser?.id || null;

const username =
  tgUser?.username || null;

const KEY = "sinaps_v2_state";


/* =========================
   STATE
========================= */

const state =
  JSON.parse(
    localStorage.getItem(KEY) || "null"
  ) || {
    points: 0,
    energy: 1000,
    maxEnergy: 1000,
    tapPower: 1,
    doubleBoost: false
  };


/* =========================
   DOM
========================= */

const $ = id =>
  document.getElementById(id);


/* =========================
   SAVE
========================= */

function save() {

  localStorage.setItem(
    KEY,
    JSON.stringify(state)
  );

}


/* =========================
   RENDER
========================= */

function render() {

  if ($("points")) {

    $("points").textContent =
      Number(state.points)
        .toLocaleString();

  }


  if ($("level")) {

    $("level").textContent =
      Math.floor(
        Number(state.points) / 1000
      ) + 1;

  }


  if ($("energyText")) {

    $("energyText").textContent =
      state.energy;

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
        Math.min(100, percent)
      ) + "%";

  }


  if ($("tapPower")) {

    $("tapPower").textContent =
      "x" + state.tapPower;

  }


  if ($("doubleBoost")) {

    if (state.doubleBoost) {

      $("doubleBoost").textContent =
        "ACTIVE";

      $("doubleBoost").classList.add(
        "active"
      );

    } else {

      $("doubleBoost").textContent =
        "ACTIVATE";

      $("doubleBoost").classList.remove(
        "active"
      );

    }

  }

}


/* =========================
   FAST TAP
========================= */

let pendingTaps = 0;

let syncing = false;


function instantTap() {

  if (!telegramId) {

    alert(
      "Please open SINAPS inside Telegram."
    );

    return;

  }


  if (state.energy <= 0) {

    return;

  }


  const power =
    state.doubleBoost
      ? 2
      : 1;


  state.points += power;

  state.energy -= 1;

  pendingTaps += 1;


  render();

  save();


  try {

    tg?.HapticFeedback
      ?.impactOccurred("light");

  } catch (error) {}


  syncTaps();


}


/* =========================
   BACKEND TAP SYNC
========================= */

async function syncTaps() {

  if (syncing) {
    return;
  }

  if (!telegramId) {
    return;
  }

  if (pendingTaps <= 0) {
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

          body: JSON.stringify({

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


    if (!response.ok) {

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
        result.accepted_taps || amount
      );


    pendingTaps =
      Math.max(
        0,
        pendingTaps - accepted
      );


    if (
      result.balance !== undefined
    ) {

      state.points =
        Number(result.balance);

    }


    if (
      result.energy !== undefined
    ) {

      state.energy =
        Number(result.energy);

    }


    if (
      result.max_energy !== undefined
    ) {

      state.maxEnergy =
        Number(result.max_energy);

    }


    save();

    render();


  } catch (error) {

    console.error(
      "Tap network error:",
      error
    );


    setTimeout(
      syncTaps,
      1000
    );

  }


  syncing = false;


  if (pendingTaps > 0) {

    setTimeout(
      syncTaps,
      100
    );

  }

}


/* =========================
   TAP BUTTON
========================= */

const tap =
  $("tap");


if (tap) {

  tap.addEventListener(
    "pointerdown",
    function(e) {

      e.preventDefault();


      instantTap();


      const floater =
        document.createElement("div");


      floater.className =
        "floater";


      const power =
        state.doubleBoost
          ? 2
          : 1;


      floater.textContent =
        "+" + power;


      const rect =
        tap.getBoundingClientRect();


      floater.style.left =
        (
          e.clientX -
          rect.left
        ) + "px";


      floater.style.top =
        (
          e.clientY -
          rect.top
        ) + "px";


      if ($("floaters")) {

        $("floaters")
          .appendChild(floater);


        setTimeout(
          () => floater.remove(),
          750
        );

      }

    },
    {
      passive: false
    }
  );

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

          body: JSON.stringify({

            telegram_id:
              telegramId,

            username:
              username

          })
        }
      );


    if (!response.ok) {

      throw new Error(
        "User API error"
      );

    }


    const user =
      await response.json();


    state.points =
      Number(user.balance || 0);


    state.energy =
      Number(
        user.energy || 0
      );


    state.maxEnergy =
      Number(
        user.max_energy || 1000
      );


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
   DOUBLE BOOST
========================= */

if ($("doubleBoost")) {

  $("doubleBoost").onclick =
    () => {

      if (state.doubleBoost) {

        alert(
          "Double Tap is already active ⚡"
        );

        return;

      }


      state.doubleBoost =
        true;

      state.tapPower =
        2;


      save();

      render();


      alert(
        "⚡ DOUBLE TAP ACTIVATED!\n\n" +
        "Every tap now gives +2 SNP."
      );

    };

}


/* =========================
   ENERGY BOOST
========================= */

if ($("energyBoost")) {

  $("energyBoost").onclick =
    () => {

      alert(
        "Energy Boost is coming soon 🚀"
      );

    };

}


/* =========================
   DAILY BONUS
========================= */

if ($("daily")) {

  $("daily").onclick =
    async () => {

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

              body: JSON.stringify({

                telegram_id:
                  telegramId

              })
            }
          );


        const result =
          await response.json();


        if (!response.ok) {

          alert(
            result.error ||
            "Daily bonus failed."
          );

          return;

        }


        state.points =
          Number(result.balance);


        save();

        render();


        alert(
          "+" +
          Number(result.bonus) +
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
    async () => {

      const id =
        telegramId || "demo";


      const link =
        location.origin +
        location.pathname +
        "?ref=" +
        id;


      if ($("referralLink")) {

        $("referralLink")
          .textContent = link;

      }


      try {

        await navigator.clipboard
          .writeText(link);


        alert(
          "Referral link copied! 👥"
        );


      } catch (error) {

        alert(link);

      }

    };

}


/* =========================
   NAVIGATION
========================= */

const navItems =
  document.querySelectorAll(
    ".nav-item"
  );


const pages =
  document.querySelectorAll(
    ".page"
  );


navItems.forEach(
  item => {

    item.addEventListener(
      "click",
      () => {

        const pageId =
          item.dataset.page;


        pages.forEach(
          page => {

            page.classList.remove(
              "active"
            );

          }
        );


        navItems.forEach(
          nav => {

            nav.classList.remove(
              "active"
            );

          }
        );


        const page =
          document.getElementById(
            pageId
          );


        if (page) {

          page.classList.add(
            "active"
          );

        }


        item.classList.add(
          "active"
        );


        window.scrollTo(
          0,
          0
        );

      }
    );

  }
);


/* =========================
   TASKS
========================= */

document
  .querySelectorAll(".task-btn")
  .forEach(
    button => {

      button.onclick =
        () => {

          alert(
            "This task is coming soon ⚡"
          );

        };

    }
  );


/* =========================
   WALLET
========================= */

if ($("walletBtn")) {

  $("walletBtn").onclick =
    () => {

      alert(
        "TON Connect is coming soon.\n\n" +
        "Never enter your seed phrase into SINAPS."
      );

    };

}


/* =========================
   RESET
========================= */

if ($("reset")) {

  $("reset").onclick =
    () => {

      if (
        confirm(
          "Reset local demo data?"
        )
      ) {

        localStorage.removeItem(
          KEY
        );

        location.reload();

      }

    };

}


/* =========================
   USER WELCOME
========================= */

if (tgUser) {

  const name =
    tgUser.first_name ||
    tgUser.username ||
    "SINAPS user";


  if ($("status")) {

    $("status").textContent =
      "Welcome " + name;

  }

}


/* =========================
   START
========================= */

render();

loadUser();


setInterval(
  render,
  1000
);
