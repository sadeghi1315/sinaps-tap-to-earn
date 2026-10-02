(function () {

  "use strict";

  /*
   * SINAPS STAGE 3
   *
   * Telegram user
   * Backend balance
   * Backend energy
   * Tap synchronization
   *
   * Backend:
   * https://sinaps-backend.onrender.com
   */

  const API =
    "https://sinaps-backend.onrender.com";


  let telegramUser = null;

  let balance = 0;

  let energy = 1000;

  let maxEnergy = 1000;

  let lastTapTime = 0;

  let loadingUser = false;

  let savingTap = false;


  function $(id) {
    return document.getElementById(id);
  }


  /* =========================
     TELEGRAM
  ========================= */

  function setupTelegram() {

    try {

      if (
        window.Telegram &&
        window.Telegram.WebApp
      ) {

        const tg =
          window.Telegram.WebApp;

        tg.ready();

        try {
          tg.expand();
        } catch (e) {}

        if (
          tg.initDataUnsafe &&
          tg.initDataUnsafe.user
        ) {

          telegramUser =
            tg.initDataUnsafe.user;

          renderTelegramUser();

        }

      }

    } catch (error) {

      console.log(
        "SINAPS Telegram error:",
        error
      );

    }

  }


  function renderTelegramUser() {

    if (!telegramUser) {
      return;
    }


    const username =
      $("username");


    if (username) {

      if (telegramUser.username) {

        username.textContent =
          "@" + telegramUser.username;

      } else if (telegramUser.first_name) {

        username.textContent =
          telegramUser.first_name;

      } else {

        username.textContent =
          "SINAPS USER";

      }

    }


    const letter =
      $("avatarLetter");


    const avatar =
      $("userAvatar");


    if (letter) {

      const first =
        telegramUser.first_name ||
        telegramUser.username ||
        "S";

      letter.textContent =
        first.charAt(0).toUpperCase();

    }


    /*
     * Telegram WebApp normally does not expose
     * the user's profile photo directly.
     *
     * So we keep the generated letter avatar
     * unless a usable photo URL exists.
     */

    if (
      telegramUser.photo_url &&
      avatar
    ) {

      avatar.src =
        telegramUser.photo_url;

      avatar.style.display =
        "block";

      if (letter) {
        letter.style.display =
          "none";
      }

    }

  }


  /* =========================
     RENDER
  ========================= */

  function render() {

    const balanceElement =
      $("balance");

    const energyElement =
      $("energy");

    const energyFill =
      $("energyFill");


    if (balanceElement) {

      balanceElement.textContent =
        Number(balance || 0)
          .toLocaleString("en-US");

    }


    if (energyElement) {

      energyElement.textContent =
        Math.floor(energy || 0) +
        " / " +
        Math.floor(maxEnergy || 1000);

    }


    if (energyFill) {

      const percent =
        maxEnergy > 0
          ? (energy / maxEnergy) * 100
          : 0;

      energyFill.style.width =
        Math.max(
          0,
          Math.min(100, percent)
        ) + "%";

    }

  }


  /* =========================
     STATUS
  ========================= */

  function setStatus(message) {

    const status =
      $("status");

    if (!status) {
      return;
    }

    status.textContent =
      message || "";

  }


  /* =========================
     LOCAL FALLBACK
  ========================= */

  function saveLocal() {

    try {

      localStorage.setItem(
        "sinaps_stage3",
        JSON.stringify({
          balance: balance,
          energy: energy,
          maxEnergy: maxEnergy
        })
      );

    } catch (error) {

      console.log(
        "SINAPS local save error:",
        error
      );

    }

  }


  function loadLocal() {

    try {

      const raw =
        localStorage.getItem(
          "sinaps_stage3"
        );

      if (!raw) {
        return false;
      }

      const data =
        JSON.parse(raw);

      if (
        data &&
        typeof data.balance === "number"
      ) {

        balance =
          data.balance;

      }

      if (
        data &&
        typeof data.energy === "number"
      ) {

        energy =
          data.energy;

      }

      if (
        data &&
        typeof data.maxEnergy === "number"
      ) {

        maxEnergy =
          data.maxEnergy;

      }

      return true;

    } catch (error) {

      return false;

    }

  }


  /* =========================
     LOAD USER FROM BACKEND
  ========================= */

  async function loadUser() {

    if (
      loadingUser ||
      !telegramUser ||
      !telegramUser.id
    ) {

      return;

    }


    loadingUser = true;

    setStatus("");


    try {

      const response =
        await fetch(
          API + "/api/user",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({

              telegram_id:
                telegramUser.id,

              username:
                telegramUser.username ||
                telegramUser.first_name ||
                ""

            })

          }
        );


      if (!response.ok) {

        throw new Error(
          "HTTP " + response.status
        );

      }


      const data =
        await response.json();


      /*
       * Support the common response
       * formats used by the backend.
       */

      const user =
        data.user ||
        data.data ||
        data;


      if (
        user &&
        user.balance !== undefined
      ) {

        balance =
          Number(user.balance) || 0;

      } else if (
        data.balance !== undefined
      ) {

        balance =
          Number(data.balance) || 0;

      }


      if (
        user &&
        user.energy !== undefined
      ) {

        energy =
          Number(user.energy);

      } else if (
        data.energy !== undefined
      ) {

        energy =
          Number(data.energy);

      }


      if (
        user &&
        user.max_energy !== undefined
      ) {

        maxEnergy =
          Number(user.max_energy) ||
          1000;

      } else if (
        data.max_energy !== undefined
      ) {

        maxEnergy =
          Number(data.max_energy) ||
          1000;

      }


      if (!Number.isFinite(energy)) {
        energy = 1000;
      }

      if (!Number.isFinite(maxEnergy)) {
        maxEnergy = 1000;
      }


      saveLocal();

      render();

      setStatus("");


    } catch (error) {

      console.log(
        "SINAPS load user error:",
        error
      );

      /*
       * Backend unavailable:
       * continue using local state.
       */

      loadLocal();

      render();

      setStatus("");

    } finally {

      loadingUser = false;

    }

  }


  /* =========================
     TAP BACKEND
  ========================= */

  async function sendTap() {

    if (
      !telegramUser ||
      !telegramUser.id
    ) {

      return;

    }


    if (savingTap) {

      /*
       * Do not block the user.
       * The local balance already changed.
       */

      return;

    }


    savingTap = true;


    try {

      const response =
        await fetch(
          API + "/api/tap",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({

              telegram_id:
                telegramUser.id

            })

          }
        );


      if (!response.ok) {

        throw new Error(
          "HTTP " + response.status
        );

      }


      const data =
        await response.json();


      const user =
        data.user ||
        data.data ||
        data;


      /*
       * If backend returns the
       * authoritative balance,
       * use it.
       */

      if (
        user &&
        user.balance !== undefined
      ) {

        balance =
          Number(user.balance) || balance;

      } else if (
        data.balance !== undefined
      ) {

        balance =
          Number(data.balance) || balance;

      }


      if (
        user &&
        user.energy !== undefined
      ) {

        energy =
          Number(user.energy);

      } else if (
        data.energy !== undefined
      ) {

        energy =
          Number(data.energy);

      }


      if (!Number.isFinite(energy)) {

        energy =
          Math.max(0, energy);

      }


      saveLocal();

      render();


    } catch (error) {

      console.log(
        "SINAPS tap sync error:",
        error
      );

      /*
       * Do NOT undo the local tap.
       * The app remains usable even if
       * Render temporarily sleeps.
       */

      saveLocal();

    } finally {

      savingTap = false;

    }

  }


  /* =========================
     TAP EFFECT
  ========================= */

  function createTapEffect(
    event,
    amount
  ) {

    const container =
      $("floaters");

    const tapArea =
      $("tapArea");


    if (
      !container ||
      !tapArea
    ) {

      return;

    }


    const element =
      document.createElement("div");


    element.className =
      "floater";


    element.textContent =
      "+" + amount;


    const rect =
      tapArea.getBoundingClientRect();


    element.style.left =
      (event.clientX - rect.left) +
      "px";


    element.style.top =
      (event.clientY - rect.top) +
      "px";


    container.appendChild(
      element
    );


    setTimeout(
      function () {

        element.remove();

      },
      850
    );

  }


  /* =========================
     COIN ANIMATION
  ========================= */

  function animateCoin(
    event
  ) {

    const coin =
      $("sLogo");


    if (!coin) {
      return;
    }


    const rect =
      coin.getBoundingClientRect();


    const centerX =
      rect.left +
      rect.width / 2;


    const centerY =
      rect.top +
      rect.height / 2;


    const dx =
      event.clientX -
      centerX;


    const dy =
      event.clientY -
      centerY;


    const distance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );


    let moveX = 0;

    let moveY = 0;


    if (distance > 0) {

      const amount =
        Math.min(
          15,
          distance * .05
        );


      moveX =
        (dx / distance) *
        amount;


      moveY =
        (dy / distance) *
        amount;

    }


    coin.style.transform =
      "translate(" +
      moveX +
      "px," +
      moveY +
      "px) scale(.93)";


    coin.style.filter =
      "brightness(1.25)";


    setTimeout(
      function () {

        coin.style.transform =
          "translate(0,0) scale(1)";

        coin.style.filter =
          "brightness(1)";

      },
      140
    );

  }


  /* =========================
     TAP
  ========================= */

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
      function (event) {

        const now =
          Date.now();


        /*
         * Very fast duplicate clicks
         * are ignored only within 40ms.
         */

        if (
          now -
          lastTapTime <
          40
        ) {

          return;

        }


        lastTapTime =
          now;


        if (energy <= 0) {

          return;

        }


        /*
         * Instant local update.
         */

        balance += 1;

        energy -= 1;


        render();

        saveLocal();


        createTapEffect(
          event,
          1
        );


        animateCoin(
          event
        );


        /*
         * Synchronize with backend
         * without blocking the UI.
         */

        sendTap();

      }
    );

  }


  /* =========================
     NAVIGATION
  ========================= */

  function setupNavigation() {

    const navItems =
      document.querySelectorAll(
        ".nav-item"
      );


    navItems.forEach(
      function (button) {

        button.addEventListener(
          "click",
          function () {

            const pageId =
              button.getAttribute(
                "data-page"
              );


            document
              .querySelectorAll(".page")
              .forEach(
                function (page) {

                  page.classList.remove(
                    "active"
                  );

                }
              );


            const target =
              document.getElementById(
                pageId
              );


            if (target) {

              target.classList.add(
                "active"
              );

            }


            navItems.forEach(
              function (item) {

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


  /* =========================
     ENERGY REGEN
  ========================= */

  function startEnergy() {

    setInterval(
      function () {

        if (
          energy <
          maxEnergy
        ) {

          energy += 1;

          render();

          saveLocal();

        }

      },
      3000
    );

  }


  /* =========================
     START
  ========================= */

  async function start() {

    console.log(
      "SINAPS STAGE 3 START"
    );


    /*
     * Load local data first so
     * the UI never waits for Render.
     */

    loadLocal();

    render();


    setupTelegram();

    setupNavigation();

    setupTap();

    startEnergy();


    /*
     * Then load authoritative
     * user data from backend.
     */

    await loadUser();


    console.log(
      "SINAPS STAGE 3 READY"
    );

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      start
    );

  } else {

    start();

  }

})();
