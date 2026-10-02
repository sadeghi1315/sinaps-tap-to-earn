(function () {

  "use strict";


  const API =
    "https://sinaps-backend.onrender.com";


  const MANIFEST =
    "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json";


  let telegramUser = null;

  let balance = 0;

  let energy = 1000;

  let maxEnergy = 1000;

  let lastTap = 0;

  let syncing = false;

  let tonUI = null;


  function $(id) {
    return document.getElementById(id);
  }


  /* =========================================
     TELEGRAM
  ========================================= */

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
        "Telegram error:",
        e
      );

    }

  }


  function showTelegramUser() {

    if (!telegramUser) return;


    const username =
      $("username");


    if (username) {

      if (
        telegramUser.username
      ) {

        username.textContent =
          "@" +
          telegramUser.username;

      }

      else if (
        telegramUser.first_name
      ) {

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
        name
          .charAt(0)
          .toUpperCase();

    }


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


  /* =========================================
     RENDER
  ========================================= */

  function render() {

    const balanceEl =
      $("balance");


    const energyEl =
      $("energy");


    const energyFill =
      $("energyFill");


    if (balanceEl) {

      balanceEl.textContent =
        Math.floor(balance)
          .toLocaleString("en-US");

    }


    if (energyEl) {

      energyEl.textContent =
        Math.floor(energy) +
        " / " +
        Math.floor(maxEnergy);

    }


    if (energyFill) {

      let percent =
        maxEnergy > 0
          ? (
              energy /
              maxEnergy
            ) * 100
          : 0;


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


  /* =========================================
     LOCAL STORAGE
  ========================================= */

  function saveLocal() {

    try {

      localStorage.setItem(
        "sinaps_v41",
        JSON.stringify({

          balance:
            balance,

          energy:
            energy,

          maxEnergy:
            maxEnergy

        })
      );

    }

    catch (e) {}

  }


  function loadLocal() {

    try {

      const raw =
        localStorage.getItem(
          "sinaps_v41"
        );


      if (!raw) return;


      const data =
        JSON.parse(raw);


      if (
        typeof data.balance ===
        "number"
      ) {

        balance =
          data.balance;

      }


      if (
        typeof data.energy ===
        "number"
      ) {

        energy =
          data.energy;

      }


      if (
        typeof data.maxEnergy ===
        "number"
      ) {

        maxEnergy =
          data.maxEnergy;

      }

    }

    catch (e) {}

  }


  /* =========================================
     LOAD USER
  ========================================= */

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

            method:
              "POST",

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


      render();

      saveLocal();

    }

    catch (e) {

      console.log(
        "Backend unavailable:",
        e
      );

      render();

    }

  }


  /* =========================================
     TAP SYNC
  ========================================= */

  async function syncTap() {

    if (
      !telegramUser ||
      !telegramUser.id ||
      syncing
    ) {

      return;

    }


    syncing = true;


    try {

      const response =
        await fetch(
          API + "/api/tap",
          {

            method:
              "POST",

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

    }

    catch (e) {

      console.log(
        "Tap sync error:",
        e
      );

      saveLocal();

    }

    finally {

      syncing = false;

    }

  }


  /* =========================================
     ADDRESS
  ========================================= */

  function shortAddress(address) {

    if (!address) {

      return "Wallet";

    }


    if (
      address.length < 18
    ) {

      return address;

    }


    return (
      address.substring(0, 7) +
      "..." +
      address.substring(
        address.length - 7
      )
    );

  }


  /* =========================================
     WALLET UI
  ========================================= */

  function showWallet(address) {

    const mini =
      $("walletMini");


    const box =
      $("walletAddress");


    const text =
      $("walletAddressText");


    const disconnect =
      $("disconnectWallet");


    const connect =
      $("connectWalletBtn");


    if (mini) {

      mini.textContent =
        shortAddress(address);

    }


    if (box) {

      box.style.display =
        "block";

    }


    if (text) {

      text.textContent =
        address;

    }


    if (disconnect) {

      disconnect.style.display =
        "block";

    }


    if (connect) {

      connect.textContent =
        "✓ Wallet Connected";

      connect.classList.add(
        "connected"
      );

    }

  }


  function clearWalletUI() {

    const mini =
      $("walletMini");


    const box =
      $("walletAddress");


    const text =
      $("walletAddressText");


    const disconnect =
      $("disconnectWallet");


    const connect =
      $("connectWalletBtn");


    if (mini) {

      mini.textContent =
        "Wallet";

    }


    if (box) {

      box.style.display =
        "none";

    }


    if (text) {

      text.textContent =
        "";

    }


    if (disconnect) {

      disconnect.style.display =
        "none";

    }


    if (connect) {

      connect.textContent =
        "🔗 Connect TON Wallet";

      connect.classList.remove(
        "connected"
      );

    }

  }


  /* =========================================
     SAVE WALLET TO BACKEND
  ========================================= */

  async function saveWallet(address) {

    if (
      !telegramUser ||
      !telegramUser.id ||
      !address
    ) {

      console.log(
        "Cannot save wallet: Telegram user missing"
      );

      return;

    }


    try {

      const response =
        await fetch(
          API +
          "/api/wallet/connect",
          {

            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({

                telegram_id:
                  telegramUser.id,

                wallet_address:
                  address

              })

          }
        );


      if (!response.ok) {

        throw new Error(
          "HTTP " +
          response.status
        );

      }


      console.log(
        "Wallet saved successfully"
      );

    }

    catch (e) {

      console.log(
        "Wallet save error:",
        e
      );

    }

  }


  /* =========================================
     TON CONNECT
  ========================================= */

  function setupTonConnect() {

    console.log(
      "Starting TON Connect..."
    );


    if (
      !window.TON_CONNECT_UI
    ) {

      console.error(
        "TON_CONNECT_UI not found"
      );


      setWalletStatus(
        "TON Connect library failed to load."
      );


      return;

    }


    try {

      tonUI =
        new window.TON_CONNECT_UI.TonConnectUI({

          manifestUrl:
            MANIFEST,

          buttonRootId:
            "ton-connect"

        });


      console.log(
        "TON Connect initialized"
      );


      tonUI.onStatusChange(
        async function (wallet) {

          console.log(
            "TON wallet status:",
            wallet
          );


          if (
            wallet &&
            wallet.account &&
            wallet.account.address
          ) {

            const address =
              wallet.account.address;


            showWallet(address);


            await saveWallet(
              address
            );


            setWalletStatus(
              "Wallet connected successfully."
            );

          }

          else {

            clearWalletUI();

          }

        }
      );


      /*
       * OUR BUTTON
       *
       * We do NOT depend on the library
       * rendering a visible button.
       */

      const connectButton =
        $("connectWalletBtn");


      if (connectButton) {

        connectButton.addEventListener(
          "click",
          async function () {

            console.log(
              "Connect button clicked"
            );


            if (!tonUI) {

              setWalletStatus(
                "TON Connect is not ready."
              );

              return;

            }


            try {

              await tonUI.openModal();

            }

            catch (e) {

              console.error(
                "TON Connect modal error:",
                e
              );


              setWalletStatus(
                "Connection error. Check TON Connect."
              );

            }

          }
        );

      }


    }

    catch (e) {

      console.error(
        "TON Connect initialization error:",
        e
      );


      setWalletStatus(
        "TON Connect initialization failed."
      );

    }

  }


  /* =========================================
     STATUS
  ========================================= */

  function setWalletStatus(message) {

    const status =
      $("status");


    if (!status) return;


    status.textContent =
      message;


    setTimeout(
      function () {

        if (
          status.textContent ===
          message
        ) {

          status.textContent =
            "";

        }

      },
      4000
    );

  }


  /* =========================================
     DISCONNECT
  ========================================= */

  function setupDisconnect() {

    const button =
      $("disconnectWallet");


    if (!button) return;


    button.addEventListener(
      "click",
      async function () {

        try {

          if (tonUI) {

            await tonUI.disconnect();

          }


          clearWalletUI();


          setWalletStatus(
            "Wallet disconnected."
          );

        }

        catch (e) {

          console.error(
            "Disconnect error:",
            e
          );

        }

      }
    );

  }


  /* =========================================
     TAP EFFECT
  ========================================= */

  function tapEffect(event) {

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


  /* =========================================
     COIN MOVE
  ========================================= */

  function moveCoin(event) {

    const coin =
      $("sLogo");


    if (!coin) return;


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


  /* =========================================
     TAP
  ========================================= */

  function setupTap() {

    const tapArea =
      $("tapArea");


    if (!tapArea) return;


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


        if (
          energy <= 0
        ) {

          return;

        }


        balance += 1;

        energy -= 1;


        render();

        saveLocal();


        tapEffect(event);

        moveCoin(event);


        syncTap();

      }
    );

  }


  /* =========================================
     NAVIGATION
  ========================================= */

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
              .querySelectorAll(
                ".page"
              )
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


  /* =========================================
     ENERGY
  ========================================= */

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


  /* =========================================
     START
  ========================================= */

  async function start() {

    console.log(
      "SINAPS Stage 4.1 starting..."
    );


    loadLocal();


    render();


    initTelegram();


    setupNavigation();


    setupTap();


    setupDisconnect();


    startEnergy();


    /*
     * TON CONNECT
     */

    setupTonConnect();


    /*
     * BACKEND
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

  }

  else {

    start();

  }

})();
