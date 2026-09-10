const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API =
  "https://sinaps-backend.onrender.com";

const tgUser =
  tg?.initDataUnsafe?.user || null;

const telegramId =
  tgUser?.id || null;

const username =
  tgUser?.username || null;

// ===============================
// LOCAL STATE
// ===============================

const KEY =
  "sinaps_v1_state";

const state =
  JSON.parse(
    localStorage.getItem(KEY) || "null"
  ) || {
    points: 0,
    energy: 1000,
    maxEnergy: 1000
  };

const $ =
  id => document.getElementById(id);

function save() {
  localStorage.setItem(
    KEY,
    JSON.stringify(state)
  );
}

// ===============================
// RENDER
// ===============================

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
}

// ===============================
// TAP QUEUE
// ===============================

let pendingTaps = 0;
let syncing = false;

// ===============================
// INSTANT TAP
// ===============================

function instantTap() {

  if (!telegramId) {
    return;
  }

  if (state.energy <= 0) {
    return;
  }

  state.points += 1;
  state.energy -= 1;

  pendingTaps += 1;

  render();
  save();

  syncTaps();
}

// ===============================
// SYNC TO SERVER
// ===============================

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
              amount
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
        result.accepted_taps || 0
      );

    pendingTaps =
      Math.max(
        0,
        pendingTaps - accepted
      );

    // سرور مرجع اصلی است
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

// ===============================
// TAP BUTTON
// ===============================

const tap =
  $("tap");

if (tap) {

  tap.addEventListener(
    "pointerdown",
    function(e) {

      e.preventDefault();

      instantTap();

      // Haptic
      try {

        tg?.HapticFeedback
          ?.impactOccurred("light");

      } catch (error) {}

      // +1 animation
      const floater =
        document.createElement("div");

      floater.className =
        "floater";

      floater.textContent =
        "+1";

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
          700
        );
      }
    },
    {
      passive: false
    }
  );
}

// ===============================
// LOAD USER
// ===============================

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
      Number(user.energy || 0);

    state.maxEnergy =
      Number(user.max_energy || 1000);

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

// ===============================
// DAILY BONUS
// ===============================

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
          " SINAPS claimed! 🎁"
        );

      } catch (error) {

        console.error(error);

        alert(
          "Connection error."
        );
      }
    };
}

// ===============================
// INVITE
// ===============================

if ($("invite")) {

  $("invite").onclick =
    () => {

      const id =
        telegramId || "demo";

      const link =
        location.origin +
        location.pathname +
        "?ref=" +
        id;

      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {

        navigator.clipboard
          .writeText(link)
          .catch(() => {});
      }

      alert(
        "Referral link copied:\n" +
        link
      );
    };
}

// ===============================
// TASKS
// ===============================

if ($("tasks")) {

  $("tasks").onclick =
    () => {

      alert(
        "Tasks module is coming soon."
      );
    };
}

// ===============================
// LEADERBOARD
// ===============================

if ($("leaderboard")) {

  $("leaderboard").onclick =
    () => {

      alert(
        "Leaderboard is coming soon."
      );
    };
}

// ===============================
// WALLET
// ===============================

if ($("walletBtn")) {

  $("walletBtn").onclick =
    () => {

      alert(
        "TON Connect is coming soon.\n\n" +
        "Never enter a seed phrase into SINAPS."
      );
    };
}

// ===============================
// RESET
// ===============================

if ($("reset")) {

  $("reset").onclick =
    () => {

      if (
        confirm(
          "Reset local demo data?"
        )
      ) {

        localStorage.removeItem(KEY);

        location.reload();
      }
    };
}

// ===============================
// USER
// ===============================

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

// ===============================
// START
// ===============================

render();

loadUser();

setInterval(
  render,
  1000
);
