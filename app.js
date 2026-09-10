const tg = window.Telegram?.WebApp;

alert("SINAPS JS RUNNING");;

if (tg) {
  tg.ready();
  tg.expand();
}

// ===============================
// SINAPS BACKEND
// ===============================

const API = "https://sinaps-backend.onrender.com";

const tgUser = tg?.initDataUnsafe?.user || null;
const telegramId = tgUser?.id || null;
const username = tgUser?.username || null;

// ===============================
// LOCAL STATE
// ===============================

const KEY = "sinaps_v1_state";

const state =
  JSON.parse(localStorage.getItem(KEY) || "null") || {
    points: 0,
    energy: 1000,
    maxEnergy: 1000,
    level: 1,
    lastEnergy: Date.now(),
    daily: null
  };

const $ = id => document.getElementById(id);

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ===============================
// RENDER
// ===============================

function render() {

  const points = $("points");
  const level = $("level");
  const energyText = $("energyText");
  const energyFill = $("energyFill");

  if (points) {
    points.textContent =
      Number(state.points).toLocaleString();
  }

  state.level =
    Math.floor(Number(state.points) / 1000) + 1;

  if (level) {
    level.textContent = state.level;
  }

  if (energyText) {
    energyText.textContent = state.energy;
  }

  if (energyFill) {

    const percent =
      state.maxEnergy > 0
        ? (state.energy / state.maxEnergy) * 100
        : 0;

    energyFill.style.width =
      Math.max(0, Math.min(100, percent)) + "%";
  }
}

// ===============================
// LOAD USER
// ===============================

async function loadUser() {

  if (!telegramId) {
    console.log("Telegram user not detected.");
    render();
    return;
  }

  try {

    const response =
      await fetch(`${API}/api/user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          telegram_id: telegramId,
          username: username
        })
      });

    if (!response.ok) {
      throw new Error(
        `User API error: ${response.status}`
      );
    }

    const user =
      await response.json();

    state.points =
      Number(user.balance ?? 0);

    state.energy =
      Number(user.energy ?? 1000);

    state.maxEnergy =
      Number(user.max_energy ?? 1000);

    state.lastEnergy =
      Date.now();

    save();
    render();

    console.log(
      "SINAPS user loaded:",
      user
    );

  } catch (error) {

    console.error(
      "Load user failed:",
      error
    );

    render();
  }
}

// ===============================
// ULTRA FAST TAP
// ===============================

let pendingTaps = 0;
let syncing = false;

// تغییر کاملاً فوری
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
}

// ===============================
// SYNC TAP
// ===============================

async function syncTaps() {

  if (syncing) return;
  if (!telegramId) return;
  if (pendingTaps <= 0) return;

  syncing = true;

  while (pendingTaps > 0) {

    try {

      const response =
        await fetch(`${API}/api/tap`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            telegram_id: telegramId
          })
        });

      const result =
        await response.json();

      if (!response.ok) {

        console.error(
          "Tap sync error:",
          result
        );

        break;
      }

      pendingTaps--;

    } catch (error) {

      console.error(
        "Tap network error:",
        error
      );

      break;
    }
  }

  syncing = false;

  // اگر اینترنت قطع شده بود دوباره تلاش کن
  if (pendingTaps > 0) {

    setTimeout(
      syncTaps,
      1000
    );

  }
}

// ===============================
// TAP BUTTON
// ===============================

const tapButton = $("tap");

if (tapButton) {

  tapButton.addEventListener(
    "pointerdown",
    function(e) {

      e.preventDefault();

      // فوری
      instantTap();

      // Haptic
      try {

        tg?.HapticFeedback?.impactOccurred(
          "light"
        );

      } catch (error) {}

      // +1 animation
      const f =
        document.createElement("div");

      f.className = "floater";
      f.textContent = "+1";

      const rect =
        tapButton.getBoundingClientRect();

      f.style.left =
        (e.clientX - rect.left - 5) + "px";

      f.style.top =
        (e.clientY - rect.top - 10) + "px";

      const floaters = $("floaters");

      if (floaters) {

        floaters.appendChild(f);

        setTimeout(() => {
          f.remove();
        }, 750);

      }

      // Backend در پس‌زمینه
      syncTaps();

    },
    {
      passive: false
    }
  );
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
          await fetch(`${API}/api/daily`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              telegram_id: telegramId
            })
          });

        const result =
          await response.json();

        if (
          result.error ===
          "Daily bonus already claimed"
        ) {

          alert(
            "Daily bonus already claimed."
          );

          return;
        }

        if (!response.ok) {

          alert(
            result.error ||
            "Daily bonus failed."
          );

          return;
        }

        state.points =
          Number(result.balance);

        state.daily =
          new Date()
            .toISOString()
            .slice(0, 10);

        save();
        render();

        alert(
          "+" +
          Number(result.bonus || 100) +
          " SINAPS claimed! 🎁"
        );

      } catch (error) {

        console.error(
          "Daily connection error:",
          error
        );

        alert(
          "Connection error. Please try again."
        );
      }
    };
}

// ===============================
// INVITE
// ===============================

if ($("invite")) {

  $("invite").onclick = () => {

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

  $("tasks").onclick = () => {

    alert(
      "Tasks module is coming soon."
    );
  };
}

// ===============================
// LEADERBOARD
// ===============================

if ($("leaderboard")) {

  $("leaderboard").onclick = () => {

    alert(
      "Leaderboard is coming soon."
    );
  };
}

// ===============================
// WALLET
// ===============================

if ($("walletBtn")) {

  $("walletBtn").onclick = () => {

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

  $("reset").onclick = () => {

    if (
      confirm("Reset local demo data?")
    ) {

      localStorage.removeItem(KEY);

      location.reload();
    }
  };
}

// ===============================
// TELEGRAM USER
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
