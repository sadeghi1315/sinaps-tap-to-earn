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

  /* =========================
     TAP STATE
  ========================= */

  let tapQueue = 0;
  let processingTaps = false;

  /*
   * تعداد Tap هایی که روی صفحه به صورت
   * محلی ثبت شده ولی هنوز از Backend
   * تأیید نگرفته‌اند.
   */
  let localPendingTaps = 0;

  let withdrawing = false;
  let energyTimer = null;


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
        Math.max(0, Math.floor(balance))
          .toLocaleString("en-US");
    }

    if (energyEl) {

      energyEl.textContent =
        Math.max(0, Math.floor(energy)) +
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
        "sinaps_v6",
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
          "sinaps_v6"
        );

      if (!raw) return;

      const data =
        JSON.parse(raw);

      if (
        data &&
        Number.isFinite(
          Number(data.balance)
        )
      ) {

        balance =
          Number(data.balance);
      }

      if (
        data &&
        Number.isFinite(
          Number(data.energy)
        )
      ) {

        energy =
          Number(data.energy);
      }

      if (
        data &&
        Number.isFinite(
          Number(data.maxEnergy)
        )
      ) {

        maxEnergy =
          Number(data.maxEnergy);
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

    /*
     * اگر Tapهای تأییدنشده داریم،
     * پاسخ /api/user نباید مقدار محلی
     * را خراب کند.
     */
    if (localPendingTaps > 0) {
      return;
    }

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

            body:
              JSON.stringify({
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

        const serverBalance =
          Number(user.balance);

        if (
          Number.isFinite(serverBalance)
        ) {

          balance =
            serverBalance;
        }
      }

      if (
        user &&
        user.energy !== undefined
      ) {

        const serverEnergy =
          Number(user.energy);

        if (
          Number.isFinite(serverEnergy)
        ) {

          energy =
            serverEnergy;
        }
      }

      if (
        user &&
        user.max_energy !== undefined
      ) {

        const serverMaxEnergy =
          Number(user.max_energy);

        if (
          Number.isFinite(
            serverMaxEnergy
          ) &&
          serverMaxEnergy > 0
        ) {

          maxEnergy =
            serverMaxEnergy;
        }
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
     SEND ONE TAP
  ========================= */

  async function sendOneTap() {

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

      let message =
        "HTTP " +
        response.status;

      try {

        const errorData =
          await response.json();

        message =
          errorData.error ||
          errorData.message ||
          message;

      } catch (e) {}

      throw new Error(message);
    }

    return await response.json();
  }


  /* =========================
     TAP QUEUE
  ========================= */

  async function processTapQueue() {

    if (processingTaps) {
      return;
    }

    if (
      !telegramUser ||
      !telegramUser.id
    ) {

      tapQueue = 0;
      localPendingTaps = 0;

      return;
    }

    if (tapQueue <= 0) {
      return;
    }

    processingTaps = true;

    try {

      while (tapQueue > 0) {

        try {

          const data =
            await sendOneTap();

          const user =
            data.user ||
            data.data ||
            data;

          /*
           * یک Tap با موفقیت روی سرور ثبت شد.
           */
          tapQueue--;

          localPendingTaps =
            Math.max(
              0,
              localPendingTaps - 1
            );

          /*
           * پاسخ سرور فقط وقتی روی UI اعمال
           * می‌شود که دیگر Tap محلی معلق
           * نداشته باشیم.
           */
          if (
            localPendingTaps === 0 &&
            tapQueue === 0
          ) {

            if (
              user &&
              user.balance !== undefined
            ) {

              const serverBalance =
                Number(user.balance);

              if (
                Number.isFinite(
                  serverBalance
                )
              ) {

                balance =
                  serverBalance;
              }
            }

            if (
              user &&
              user.energy !== undefined
            ) {

              const serverEnergy =
                Number(user.energy);

              if (
                Number.isFinite(
                  serverEnergy
                )
              ) {

                energy =
                  serverEnergy;
              }
            }

            if (
              user &&
              user.max_energy !== undefined
            ) {

              const serverMaxEnergy =
                Number(user.max_energy);

              if (
                Number.isFinite(
                  serverMaxEnergy
                ) &&
                serverMaxEnergy > 0
              ) {

                maxEnergy =
                  serverMaxEnergy;
              }
            }

            render();
            saveLocal();
          }

        } catch (e) {

          console.log(
            "Tap sync failed:",
            e
          );

          /*
           * Tap محلی را نگه می‌داریم.
           * دوباره tapQueue را زیاد نمی‌کنیم،
           * چون این Tap هنوز داخل صف است.
           */

          break;
        }
      }

    } finally {

      processingTaps = false;

      /*
       * اگر Tap جدیدی باقی مانده،
       * کمی بعد دوباره ارسال کن.
       */

      if (tapQueue > 0) {

        setTimeout(
          processTapQueue,
          500
        );
      }
    }
  }


  /* =========================
     TAP EFFECT
  ========================= */

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

    const x =
      event.clientX -
      rect.left;

    const y =
      event.clientY -
      rect.top;

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


  /* =========================
     COIN MOVEMENT
  ========================= */

  function moveCoin(event) {

    const coin =
      $("sCoin");

    const logo =
      $("sLogo");

    const area =
      $("tapArea");

    if (
      !coin ||
      !logo ||
      !area
    ) {
      return;
    }

    const rect =
      area.getBoundingClientRect();

    const x =
      event.clientX -
      rect.left;

    const y =
      event.clientY -
      rect.top;

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

        coin.classList.remove(
          "hit"
        );

        logo.style.transform =
          "rotate(0deg)";

      },
      120
    );
  }


  /* =========================
     TAP
  ========================= */

  function setupTap() {

    const area =
      $("tapArea");

    if (!area) {
      return;
    }

    area.addEventListener(
      "pointerdown",
      function (event) {

        event.preventDefault();

        /*
         * هیچ Tap بدون Telegram user
         * به Backend فرستاده نمی‌شود.
         */
        if (
          !telegramUser ||
          !telegramUser.id
        ) {
          return;
        }

        if (energy <= 0) {
          return;
        }

        /*
         * Optimistic update
         *
         * بلافاصله روی صفحه:
         * Balance +1
         * Energy -1
         */

        balance += 1;

        energy -= 1;

        /*
         * این Tap هنوز روی سرور
         * تأیید نشده است.
         */

        tapQueue += 1;
        localPendingTaps += 1;

        render();
        saveLocal();

        tapEffect(event);
        moveCoin(event);

        /*
         * صف را پردازش کن.
         */

        processTapQueue();

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

    if (energyTimer) {

      clearInterval(
        energyTimer
      );
    }

    energyTimer =
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
     WALLET
  ========================= */

  function setWalletStatus(message) {

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


  async function saveWallet(address) {

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


  /* =========================
     TON CONNECT
  ========================= */

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

            setWalletStatus("");
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


  /* =========================
     DISCONNECT
  ========================= */

  function setupDisconnect() {

    const button =
      $("disconnectWallet");

    if (!button) {
      return;
    }

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

    if (!el) {
      return;
    }

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

    if (!el) {
      return;
    }

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
        data.error ||
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
        data.error ||
        data.message ||
        "Payment verification failed."
      );
    }

    return data;
  }


  async function setupWithdraw() {

    const button =
      $("withdrawBtn");

    if (!button) {
      return;
    }

    updateWithdrawBalance();

    button.addEventListener(
      "click",
      async function () {

        if (withdrawing) {
          return;
        }

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

          /*
           * قبل از برداشت، Tapهای در صف
           * باید تمام شوند.
           */

          if (tapQueue > 0) {

            setWithdrawStatus(
              "Please wait for your taps to sync...",
              false
            );

            await processTapQueue();

            if (tapQueue > 0) {

              throw new Error(
                "Tap synchronization is still pending."
              );
            }
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

          if (!Number.isInteger(amount)) {

            throw new Error(
              "SNP amount must be a whole number."
            );
          }

          if (amount > balance) {

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

    /*
     * ابتدا Local را بخوان.
     * این باعث می‌شود UI سریع نمایش داده شود.
     */

    loadLocal();

    render();

    initTelegram();

    setupNavigation();

    setupTap();

    startEnergy();

    setupTonConnect();

    setupDisconnect();

    setupWithdraw();

    /*
     * بعد مقدار Backend را بگیر.
     */

    await loadUser();

    render();
  }


  /* =========================
     START APP
  ========================= */

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
