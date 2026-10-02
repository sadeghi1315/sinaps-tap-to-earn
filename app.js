(function () {

  "use strict";

  const API =
    "https://sinaps-backend.onrender.com";

  let telegramUser = null;

  let balance = 0;

  let energy = 1000;

  let maxEnergy = 1000;

  let lastTap = 0;

  let syncing = false;


  function $(id) {
    return document.getElementById(id);
  }


  /* =========================
     TELEGRAM USER
  ========================= */

  function initTelegram() {

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

          showTelegramUser();

        }

      }

    } catch (e) {

      console.log(
        "Telegram init error:",
        e
      );

    }

  }


  function showTelegramUser() {

    if (!telegramUser) {
      return;
    }


    const username =
      $("username");


    if (username) {

      if (telegramUser.username) {

        username.textContent =
          "@" +
          telegramUser.username;

      } else if (telegramUser.first_name) {

        username.textContent =
          telegramUser.first_name;

      }

    }


    const letter =
      $("avatarLetter");


    if (letter) {

      const name =
        telegramUser.first_name ||
        telegramUser.username ||
        "S";

      letter.textContent =
        name.charAt(0).toUpperCase();

    }


    /*
     * Some Telegram clients provide
     * photo_url through initData.
     */

    if (
      telegramUser.photo_url
    ) {

      const avatar =
        $("userAvatar");


      if (avatar) {

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

  }


  /* =========================
     RENDER
  ========================= */

  function render() {

    const balanceEl =
      $("balance");

    const energyEl =
      $("energy");

    const energyFill =
      $("energyFill");


    if (balanceEl) {

      balanceEl.textContent =
        Math.floor(
          balance
        ).toLocaleString(
          "en-US"
        );

    }


    if (energyEl) {

      energyEl.textContent =
        Math.floor(energy) +
        " / " +
        Math.floor(maxEnergy);

    }


    if (energyFill) {

      let percent =
        0;


      if (maxEnergy > 0) {

        percent =
          (energy / maxEnergy) *
          100;

      }


      percent =
        Math.max(
          0,
          Math.min(
            100,
            percent
          )
        );


      energyFill.style.width =
        percent + "%";

    }

  }


  /* =========================
     LOCAL STORAGE
  ========================= */

  function saveLocal() {

    try {

      localStorage.setItem(
        "sinaps_v3",
        JSON.stringify({

          balance:
            balance,

          energy:
            energy,

          maxEnergy:
            maxEnergy

        })
      );

    } catch (e) {}

  }


  function loadLocal() {

    try {

      const raw =
        localStorage.getItem(
          "sinaps_v3"
        );


      if (!raw) {
        return;
      }


      const data =
        JSON.parse(raw);


      if (
        data &&
        typeof data.balance ===
        "number"
      ) {

        balance =
          data.balance;

      }


      if (
        data &&
        typeof data.energy ===
        "number"
      ) {

        energy =
          data.energy;

      }


      if (
        data &&
        typeof data.maxEnergy ===
        "number"
      ) {

        maxEnergy =
          data.maxEnergy;

      }

    } catch (e) {}

  }


  /* =========================
     LOAD BACKEND USER
  ========================= */

  async function loadUser() {

    if (
      !telegramUser ||
      !telegramUser.id
    ) {

      return;

    }


    try {

      const controller =
        new AbortController();


      const timeout =
        setTimeout(
          function () {
            controller.abort();
          },
          7000
        );


      const response =
        await fetch(
          API + "/api/user",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({

                telegram_id:
                  telegramUser.id,

                username:
                  telegramUser.username ||
                  telegramUser.first_name ||
                  ""

              }),

            signal:
              controller.signal

          }
        );


      clearTimeout(timeout);


      if (!response.ok) {

        throw new Error(
          "HTTP " +
          response.status
        );

      }


      const data =
        await response.json();


      const user =
        data.user ||
        data.data ||
        data;


      if (
        user &&
        user.balance !== undefined
      ) {

        balance =
          Number(
            user.balance
          ) || 0;

      }


      if (
        user &&
        user.energy !== undefined
      ) {

        energy =
          Number(
            user.energy
          );

      }


      if (
        user &&
        user.max_energy !== undefined
      ) {

        maxEnergy =
          Number(
            user.max_energy
          ) || 1000;

      }


      if (!Number.isFinite(energy)) {

        energy =
          1000;

      }


      if (!Number.isFinite(maxEnergy)) {

        maxEnergy =
          1000;

      }


      render();

      saveLocal();


    } catch (e) {

      console.log(
        "Backend unavailable:",
        e
      );

      /*
       * IMPORTANT:
       * App continues normally.
       */

      render();

    }

  }


  /* =========================
     SEND TAP
  ========================= */

  async function syncTap() {

    if (
      !telegramUser ||
      !telegramUser.id
    ) {

      return;

    }


    if (syncing) {

      return;

    }


    syncing = true;


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

            body:
              JSON.stringify({

                telegram_id:
                  telegramUser.id

              })

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


      const user =
        data.user ||
        data.data ||
        data;


      if (
        user &&
        user.balance !== undefined
      ) {

        balance =
          Number(
            user.balance
          ) || balance;

      }


      if (
        user &&
        user.energy !== undefined
      ) {

        energy =
          Number(
            user.energy
          );

      }


      render();

      saveLocal();


    } catch (e) {

      console.log(
        "Tap sync failed:",
        e
      );

      /*
       * Local tap remains.
       */

      saveLocal();

    } finally {

      syncing = false;

    }

  }


  /* =========================
     TAP EFFECT
  ========================= */

  function tapEffect(
    event
  ) {

    const tapArea =
      $("tapArea");

    const floaters =
      $("floaters");


    if (
      !tapArea ||
      !floaters
    ) {

      return;

    }


    const rect =
      tapArea.getBoundingClientRect();


    const floater =
      document.createElement(
        "div"
      );


    floater.className =
      "floater";


    floater.textContent =
      "+1";


    floater.style.left =
      (
        event.clientX -
        rect.left
      ) + "px";


    floater.style.top =
      (
        event.clientY -
        rect.top
      ) + "px";


    floaters.appendChild(
      floater
    );


    setTimeout(
      function () {

        floater.remove();

      },
      850
    );

  }


  /* =========================
     COIN MOVEMENT
  ========================= */

  function moveCoin(
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


    let x = 0;

    let y = 0;


    if (distance > 0) {

      const amount =
        Math.min(
          15,
          distance * .05
        );


      x =
        dx /
        distance *
        amount;


      y =
        dy /
        distance *
        amount;

    }


    coin.style.transform =
      "translate(" +
      x +
      "px," +
      y +
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
      return;
    }


    tapArea.addEventListener(
      "click",
      function (event) {

        const now =
          Date.now();


        if (
          now -
          lastTap <
          40
        ) {

          return;

        }


        lastTap =
          now;


        if (energy <= 0) {

          return;

        }


        /*
         * Instant UI update.
         */

        balance += 1;

        energy -= 1;


        render();

        saveLocal();


        tapEffect(
          event
        );


        moveCoin(
          event
        );


        /*
         * Backend sync happens
         * without freezing UI.
         */

        syncTap();

      }
    );

  }


  /* =========================
     NAVIGATION
  ========================= */

  function setupNavigation() {

    const buttons =
      document.querySelectorAll(
        ".nav-item"
      );


    buttons.forEach(
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


            const page =
              document.getElementById(
                pageId
              );


            if (page) {

              page.classList.add(
                "active"
              );

            }


            buttons.forEach(
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
     ENERGY
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

    /*
     * Local data first.
     * This guarantees UI starts
     * even when Render is sleeping.
     */

    loadLocal();

    render();


    initTelegram();

    setupNavigation();

    setupTap();

    startEnergy();


    /*
     * Backend after UI starts.
     */

    await loadUser();

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
