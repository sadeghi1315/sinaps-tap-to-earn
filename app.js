const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "https://sinaps-backend.onrender.com";

const tgUser = tg?.initDataUnsafe?.user || null;
const telegramId = tgUser?.id || null;

const KEY = "sinaps_v1_state";

const state =
  JSON.parse(localStorage.getItem(KEY) || "null") || {
    points: 0,
    energy: 1000,
    maxEnergy: 1000
  };

const $ = id => document.getElementById(id);

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function render() {

  $("points").textContent =
    Number(state.points).toLocaleString();

  $("energyText").textContent =
    state.energy;

  const percent =
    (state.energy / state.maxEnergy) * 100;

  $("energyFill").style.width =
    percent + "%";
}

// ===============================
// TAP
// ===============================

const tap = $("tap");

if (tap) {

  tap.addEventListener("pointerdown", function(e) {

    e.preventDefault();

    if (state.energy <= 0) {
      return;
    }

    state.points++;
    state.energy--;

    save();
    render();

    try {
      tg?.HapticFeedback?.impactOccurred("light");
    } catch (error) {}

    const floater =
      document.createElement("div");

    floater.className = "floater";
    floater.textContent = "+1";

    const rect =
      tap.getBoundingClientRect();

    floater.style.left =
      (e.clientX - rect.left) + "px";

    floater.style.top =
      (e.clientY - rect.top) + "px";

    $("floaters").appendChild(floater);

    setTimeout(() => {
      floater.remove();
    }, 700);

  });

}

// ===============================
// START
// ===============================

render();

console.log(
  "SINAPS STARTED",
  telegramId
);
