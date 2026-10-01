const API = "https://sinaps-backend.onrender.com";

/* =========================
   TELEGRAM
========================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {
    console.log("Telegram init:", e);
  }
}

const telegramUser = tg?.initDataUnsafe?.user || null;

const telegramId = telegramUser?.id || null;

const telegramUsername =
  telegramUser?.username ||
  telegramUser?.first_name ||
  "SINAPS User";


/* =========================
   HELPERS
========================= */

const $ = (id) => document.getElementById(id);

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function shortAddress(address) {
  if (!address) return "";

  if (address.length < 16) {
    return address;
  }

  return (
    address.substring(0, 6) +
    "..." +
    address.substring(address.length - 6)
  );
}


/* =========================
   STATE
========================= */

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


/* =========================
   LOAD LOCAL STATE
========================= */

function loadLocalState() {
