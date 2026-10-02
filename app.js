(function () {

  "use strict";

  const API =
    "https://sinaps-backend.onrender.com";

  const MANIFEST =
    "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json";

  const TREASURY_WALLET =
    "UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX";

  const SNP_CONTRACT =
    "EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls";

  const WITHDRAW_FEE_NANO =
    "100000000";

  const MAINNET =
    "-239";


  let telegramUser = null;

  let tonUI = null;

  let balance = 0;

  let energy = 1000;

  let maxEnergy = 1000;

  let syncing = false;

  let withdrawing = false;


  function $(id) {
    return document.getElementById(id);
  }


  /* =========================
     TELEGRAM
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

    if (!telegramUser) return;

    const username =
      $("username");

    if (username) {

      if (telegramUser.username) {

        username.textContent =
          "@" + telegramUser.username;

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


    if (telegramUser.photo_url) {

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
          ? (energy / maxEnergy) * 100
          : 0;

      percent =
        Math.max(
          0,
          Math.min(100, percent)
        );

      energyFill.style.width =
        percent + "%";

    }


    updateWithdrawBalance();

  }


  /* =========================
     LOCAL STORAGE
  ========================= */

  function saveLocal() {

    try {

      localStorage.setItem(
        "sinaps_v4",
        JSON.stringify({
          balance: balance,
          energy: energy,
          maxEnergy: maxEnergy
        })
      );

    } catch (e) {}

  }


  function loadLocal() {

    try {

      const raw =
        localStorage.getItem(
          "sinaps_v4"
        );

      if (!raw) return;

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

    } catch (e) {}

  }


  /* =========================
     BACKEND USER
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
          Number(user.balance) || 0;

      }


      if (
        user &&
        user.energy !== undefined
      ) {

        energy =
          Number(user.energy);

      }


      if (
        user &&
        user.max_energy !== undefined
      ) {

        maxEnergy =
          Number(user.max_energy) ||
          1000;

      }


      if (!Number.isFinite(energy)) {
        energy = 1000;
      }


      if (!Number.isFinite(maxEnergy)) {
        maxEnergy = 1000;
      }


      render();

      saveLocal();

    } catch (e) {

      console.log(
        "Backend unavailable:",
        e
      );

      render();

    }

  }


  /* =========================
     TAP
  ========================= */

  async function syncTap() {

    if (
      !telegramUser ||
      !telegramUser.id
    ) {
      return;
    }


    if (syncing) return;

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
          Number(user.balance) ||
          balance;

      }


      if (
        user &&
        user.energy !== undefined
      ) {

        energy =
          Number(user.energy);

      }


      render();

      saveLocal();

    } catch (e) {

      console.log(
        "Tap sync failed:",
        e
      );

      saveLocal();

    } finally {

      syncing = false;

    }

  }


  function tapEffect(event) {

    const area =
      $("tapArea");

    const container =
      $("floaters");

    if (!area || !container) {
      return;
    }


    const rect =
      area.getBoundingClientRect();


    let x =
      event.clientX -
      rect.left;

    let y =
      event.clientY -
      rect.top;


    if (
      event.touches &&
      event.touches.length
    ) {

      x =
        event.touches[0].clientX -
        rect.left;

      y =
        event.touches[0].clientY -
        rect.top;

    }


    const el =
      document.createElement("div");

    el.className =
      "floater";

    el.textContent =
      "+1";


    el.style.left =
      x + "px";

    el.style.top =
      y + "px";


    container.appendChild(el);


    setTimeout(
      function () {
        el.remove();
      },
      800
    );

  }


  function moveCoin(event) {

    const coin =
      $("sCoin");

    const logo =
      $("sLogo");

    const area =
      $("tapArea");

    if (!coin || !logo || !area) {
      return;
    }


    const rect =
      area.getBoundingClientRect();


    let x =
      event.clientX -
      rect.left;

    let y =
      event.clientY -
      rect.top;


    if (
      event.touches &&
      event.touches.length
    ) {

      x =
        event.touches[0].clientX -
        rect.left;

      y =
        event.touches[0].clientY -
        rect.top;

    }


    const centerX =
      rect.width / 2;

    const centerY =
      rect.height / 2;


    const dx =
      x - centerX;

    const dy =
      y - centerY;


    const angle =
      Math.atan2(dy, dx) *
      180 /
      Math.PI;


    logo.style.transform =
      "rotate(" +
      (angle * 0.10) +
      "deg)";


    coin.classList.add("hit");


    setTimeout(
      function () {
        coin.classList.remove("hit");
        logo.style.transform =
          "rotate(0deg)";
      },
      120
    );

  }


  function setupTap() {

    const area =
      $("tapArea");

    if (!area) return;


    area.addEventListener(
      "pointerdown",
      function (event) {

        event.preventDefault();


        if (energy <= 0) {

          return;

        }


        balance += 1;

        energy -= 1;


        render();

        saveLocal();

        tapEffect(event);

        moveCoin(event);

        syncTap();

      },
      {
        passive: false
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

          if (
            energy >
            maxEnergy
          ) {
            energy =
              maxEnergy;
          }

          render();

          saveLocal();

        }

      },
      3000
    );

  }


  /* =========================
     NAVIGATION
  ========================= */

  function setupNavigation() {

    const buttons =
      document.querySelectorAll(
        ".nav-btn"
      );


    buttons.forEach(
      function (button) {

        button.addEventListener(
          "click",
          function () {

            const page =
              button.dataset.page;

            document
              .querySelectorAll(
                ".page"
              )
              .forEach(
                function (item) {
                  item.classList.remove(
                    "active"
                  );
                }
              );


            const target =
              $(page);

            if (target) {
              target.classList.add(
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
     TON CONNECT
  ========================= */

  function setWalletStatus(
    message
  ) {

    const el =
      $("walletStatus");

    if (el) {
      el.textContent =
        message;
    }

  }


  function showWallet(address) {

    const box =
      $("walletAddress");

    const text =
      $("walletAddressText");

    const disconnect =
      $("disconnectWallet");

    const connect =
      $("connectWalletBtn");

    const mini =
      $("wallet-mini");


    if (box) {
      box.style.display =
        "block";
    }


    if (disconnect) {
      disconnect.style.display =
        "block";
    }


    if (connect) {
      connect.style.display =
        "none";
    }


    if (text) {
      text.textContent =
        address;
    }


    if (mini) {

      mini.textContent =
        address.substring(0, 6) +
        "..." +
        address.substring(
          address.length - 6
        );

    }

  }


  function clearWalletUI() {

    const box =
      $("walletAddress");

    const disconnect =
      $("disconnectWallet");

    const connect =
      $("connectWalletBtn");

    const mini =
      $("wallet-mini");


    if (box) {
      box.style.display =
        "none";
    }


    if (disconnect) {
      disconnect.style.display =
        "none";
    }


    if (connect) {
      connect.style.display =
        "block";
    }


    if (mini) {
      mini.textContent =
        "Wallet not connected";
    }

  }


  async function saveWallet(
    address
  ) {

    if (
      !telegramUser ||
      !telegramUser.id ||
      !address
    ) {

      return;

    }


    try {

      const response =
        await fetch(
          API + "/api/wallet/connect",
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
        "Wallet saved."
      );

    } catch (e) {

      console.log(
        "Wallet save error:",
        e
      );

    }

  }


  function setupTonConnect() {

    console.log(
      "Starting TON Connect..."
    );


    if (!window.TON_CONNECT_UI) {

      console.error(
        "TON_CONNECT_UI not found"
      );

      setWalletStatus(
        "TON Connect failed to load."
      );

      return;

    }


    try {

      tonUI =
        new window
          .TON_CONNECT_UI
          .TonConnectUI({
            manifestUrl:
              MANIFEST,

            buttonRootId:
              "ton-connect"
          });


      tonUI.onStatusChange(
        async function (wallet) {

          console.log(
            "TON wallet:",
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

          } else {

            clearWalletUI();

            setWalletStatus(
              ""
            );

          }

        }
      );


      const button =
        $("connectWalletBtn");


      if (button) {

        button.addEventListener(
          "click",
          async function () {

            if (!tonUI) {

              setWalletStatus(
                "TON Connect is not ready."
              );

              return;

            }


            try {

              await tonUI.openModal();

            } catch (e) {

              console.error(
                "TON Connect error:",
                e
              );

              setWalletStatus(
                "Connection error."
              );

            }

          }
        );

      }


    } catch (e) {

      console.error(
        "TON Connect init error:",
        e
      );

      setWalletStatus(
        "TON Connect initialization failed."
      );

    }

  }


  async function setupDisconnect() {

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


        } catch (e) {

          console.error(
            "Disconnect error:",
            e
          );

        }

      }
    );

  }


  /* =========================
     WITHDRAW
  ========================= */

  function updateWithdrawBalance() {

    const el =
      $("withdrawBalance");

    if (!el) return;


    el.textContent =
      Math.floor(balance)
        .toLocaleString("en-US") +
      " SNP";

  }


  function setWithdrawStatus(
    message,
    success
  ) {

    const el =
      $("withdrawStatus");

    if (!el) return;


    el.textContent =
      message;


    el.style.color =
      success
        ? "#7CFF9B"
        : "#FFD86B";

  }


  async function createWithdrawal(
    amount,
    walletAddress
  ) {

    const response =
      await fetch(
        API + "/api/withdraw/create",
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

              wallet_address:
                walletAddress,

              amount:
                Math.floor(amount)

            })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Could not create withdrawal."
      );

    }


    return data;

  }


  async function verifyWithdrawal(
    withdrawalId,
    walletAddress
  ) {

    const response =
      await fetch(
        API + "/api/withdraw/verify",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              withdrawal_id:
                withdrawalId,

              telegram_id:
                telegramUser.id,

              wallet_address:
                walletAddress

            })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Payment verification failed."
      );

    }


    return data;

  }


  async function setupWithdraw() {

    const button =
      $("withdrawBtn");

    if (!button) return;


    updateWithdrawBalance();


    button.addEventListener(
      "click",
      async function () {

        if (withdrawing) return;

        withdrawing = true;

        button.disabled = true;


        try {

          if (
            !telegramUser ||
            !telegramUser.id
          ) {

            throw new Error(
              "Telegram user not detected."
            );

          }


          if (!tonUI) {

            throw new Error(
              "TON Connect is not ready."
            );

          }


          if (!tonUI.wallet) {

            throw new Error(
              "First connect your TON wallet."
            );

          }


          const input =
            $("withdrawAmount");


          const amount =
            Number(
              input
                ? input.value
                : 0
            );


          if (
            !Number.isFinite(amount) ||
            amount <= 0
          ) {

            throw new Error(
              "Enter a valid SNP amount."
            );

          }


          if (
            !Number.isInteger(amount)
          ) {

            throw new Error(
              "SNP amount must be a whole number."
            );

          }


          if (
            amount > balance
          ) {

            throw new Error(
              "Insufficient SNP balance."
            );

          }


          const walletAddress =
            tonUI.wallet.account.address;


          setWithdrawStatus(
            "Creating withdrawal request...",
            true
          );


          const request =
            await createWithdrawal(
              amount,
              walletAddress
            );


          const withdrawalId =
            request.withdrawal_id;


          if (!withdrawalId) {

            throw new Error(
              "Invalid withdrawal ID."
            );

          }


          setWithdrawStatus(
            "Approve the 0.1 TON fee in your wallet...",
            true
          );


          /*
           * IMPORTANT:
           * This transaction only pays the
           * fixed withdrawal fee.
           */

          await tonUI.sendTransaction({

            validUntil:
              Math.floor(
                Date.now() / 1000
              ) + 300,

            network:
              MAINNET,

            messages: [

              {
                address:
                  TREASURY_WALLET,

                amount:
                  WITHDRAW_FEE_NANO
              }

            ]

          });


          setWithdrawStatus(
            "Payment sent. Verifying...",
            true
          );


          /*
           * Backend checks the blockchain.
           */

          const verification =
            await verifyWithdrawal(
              withdrawalId,
              walletAddress
            );


          if (
            verification.status ===
            "verified"
          ) {

            setWithdrawStatus(
              "Payment verified. Your SNP withdrawal is processing.",
              true
            );

          } else {

            setWithdrawStatus(
              verification.message ||
              "Payment received and withdrawal is pending.",
              true
            );

          }


          if (input) {
            input.value = "";
          }


        } catch (error) {

          console.error(
            "Withdraw error:",
            error
          );


          setWithdrawStatus(
            error.message ||
            "Withdrawal failed or cancelled.",
            false
          );

        } finally {

          withdrawing = false;

          button.disabled = false;

        }

      }
    );

  }


  /* =========================
     START
  ========================= */

  async function start() {

    loadLocal();

    render();

    initTelegram();

    setupNavigation();

    setupTap();

    startEnergy();

    setupTonConnect();

    setupDisconnect();

    setupWithdraw();

    await loadUser();

    render();

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
