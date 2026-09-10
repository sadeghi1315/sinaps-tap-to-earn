const tg = window.Telegram?.WebApp;

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

  if ($("points")) {
    $("points").textContent =
      Number(state.points).toLocaleString();
  }

  state.level =
    Math.floor(Number(state.points) / 1000) + 1;

  if ($("level")) {
    $("level").textContent = state.level;
  }

  if ($("energyText")) {
    $("energyText").textContent = state.energy;
  }

  if ($("energyFill")) {

    const percent =
      state.maxEnergy > 0
        ? (state.energy / state.maxEnergy) * 100
        : 0;

    $("energyFill").style.width =
      Math.max(0, Math.min(100, percent)) + "%";
  }
}

// ===============================
// LOAD USER FROM BACKEND
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

    console.log("SINAPS user loaded:", user);

  } catch (error) {

    console.error(
      "Load user failed:",
      error
    );

    render();
  }
}

// ===============================
// TAP
// ===============================

let tapBusy = false;

async function sendTap() {

  if (!telegramId) {

    alert(
      "Please open SINAPS inside Telegram."
    );

    return;
  }

  if (tapBusy) return;

  if (state.energy <= 0) {
    return;
  }

  tapBusy = true;

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
        "Tap API error:",
        result
      );

      if (result.energy !== undefined) {
        state.energy =
          Number(result.energy);
      }

      if (result.balance !== undefined) {
        state.points =
          Number(result.balance);
      }

      save();
      render();

      return;
    }

    // مقدار واقعی از Backend
    state.points =
      Number(result.balance);

    state.energy =
      Number(result.energy);

    state.maxEnergy =
      Number(result.max_energy ?? state.maxEnergy);

    state.lastEnergy =
      Date.now();

    save();
    render();

  } catch (error) {

    console.error(
      "Tap connection error:",
      error
    );

  } finally {

    tapBusy = false;

  }
}

// ===============================
// TAP BUTTON
// ===============================

if ($("tap")) {

  $("tap").addEventListener(
    "pointerdown",
    async e => {

      if (state.energy <= 0) {
        return;
      }

      // افکت +1
      const f =
        document.createElement("div");

      f.className = "floater";
      f.textContent = "+1";

      f.style.left =
        (e.offsetX - 5) + "px";

      f.style.top =
        (e.offsetY - 10) + "px";

      if ($("floaters")) {

        $("floaters").appendChild(f);

        setTimeout(() => {
          f.remove();
        }, 750);

      }

      await sendTap();

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

        console.log(
          "Daily response:",
          result
        );

        // Bonus قبلاً گرفته شده
        if (
          result.error ===
          "Daily bonus already claimed"
        ) {

          alert(
            "Daily bonus already claimed."
          );

          if (
            result.balance !== undefined
          ) {

            state.points =
              Number(result.balance);

            save();
            render();

          }

          return;
        }

        if (!response.ok) {

          alert(
            result.error ||
            "Daily bonus failed."
          );

          return;
        }

        // دریافت موجودی واقعی
        if (
          result.balance !== undefined
        ) {

          state.points =
            Number(result.balance);

        }

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
// INVITE / REFERRAL
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

// فقط برای نمایش UI
setInterval(render, 1000);
