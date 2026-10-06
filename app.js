(function () {
  "use strict";

  /* =========================================================
     SINAPS — Telegram Mini App
     FAST USER + BALANCE VERSION
     ========================================================= */

  const API = "https://sinaps-backend.onrender.com";

  const MANIFEST =
    "https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json";

  const TREASURY =
    "UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX";

  const FEE_NANO = "100000000";
  const MAINNET = "-239";

  let tg = null;
  let user = null;
  let initData = "";

  let tonUI = null;

  let balance = 0;
  let energy = 1000;
  let maxEnergy = 1000;

  let queue = 0;
  let pending = 0;
  let processing = false;

  let energyTimer = null;
  let withdrawing = false;

  let bootFinished = false;

  const $ = (id) => document.getElementById(id);


  /* =========================================================
     TELEGRAM
     ========================================================= */

  function telegram() {
    try {
      if (!window.Telegram || !window.Telegram.WebApp) {
        console.warn("Telegram WebApp not found");
        return;
      }

      tg = window.Telegram.WebApp;

      tg.ready();

      /*
       * Do NOT force fullscreen.
       * Keep normal Telegram Mini App window behavior.
       */

      try {
        if (typeof tg.disableVerticalSwipes === "function") {
          tg.disableVerticalSwipes();
        }
      } catch (_) {}

      try {
        tg.setHeaderColor("#02030d");
        tg.setBackgroundColor("#02030d");
      } catch (_) {}

      user = tg.initDataUnsafe?.user || null;
      initData = tg.initData || "";

      /*
       * IMPORTANT:
       * Show Telegram username immediately.
       * This does not wait for backend.
       */

      renderTelegramUser();

    } catch (e) {
      console.error("Telegram init error:", e);
    }
  }


  function renderTelegramUser() {

    if (!user) return;

    const username =
      user.username
        ? "@" + user.username
        : (user.first_name || "SINAPS User");

    if ($("username")) {
      $("username").textContent = username;
    }

    if ($("avatarLetter")) {
      const letter =
        (user.first_name ||
          user.username ||
          "S")
          .charAt(0)
          .toUpperCase();

      $("avatarLetter").textContent = letter;
    }

    if (user.photo_url && $("userAvatar")) {

      $("userAvatar").src = user.photo_url;

      $("userAvatar").style.display = "block";

      if ($("avatarLetter")) {
        $("avatarLetter").style.display = "none";
      }
    }
  }


  /* =========================================================
     HELPERS
     ========================================================= */

  function notify(message, ok = false) {

    let x = $("sinapsToast");

    if (!x) {

      x = document.createElement("div");

      x.id = "sinapsToast";

      document.body.appendChild(x);
    }

    x.textContent = message;

    x.className = ok ? "ok" : "";

    x.style.display = "block";

    clearTimeout(x._timer);

    x._timer = setTimeout(() => {

      x.style.display = "none";

    }, 2800);
  }


  function esc(s) {

    return String(s ?? "").replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;"
        }[c])
    );
  }


  /* =========================================================
     API
     ========================================================= */

  async function api(path, options = {}) {

    options.headers = Object.assign(
      {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData
      },
      options.headers || {}
    );

    /*
     * Automatically send init_data to backend.
     */

    if (
      options.body &&
      typeof options.body === "string"
    ) {

      try {

        const body = JSON.parse(options.body);

        body.init_data = initData;

        options.body = JSON.stringify(body);

      } catch (_) {}
    }

    const response = await fetch(
      API + path,
      options
    );

    let data = {};

    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok) {

      throw new Error(
        data.error ||
        data.message ||
        ("HTTP " + response.status)
      );
    }

    return data;
  }


  /* =========================================================
     RENDER
     ========================================================= */

  function render() {

    const safeBalance =
      Math.max(0, Math.floor(Number(balance) || 0));

    const safeEnergy =
      Math.max(0, Math.floor(Number(energy) || 0));

    const safeMaxEnergy =
      Math.max(
        1,
        Math.floor(Number(maxEnergy) || 1000)
      );


    if ($("balance")) {

      $("balance").textContent =
        safeBalance.toLocaleString();
    }


    if ($("boostBalance")) {

      $("boostBalance").textContent =
        safeBalance.toLocaleString();
    }


    if ($("energy")) {

      $("energy").textContent =
        safeEnergy +
        " / " +
        safeMaxEnergy;
    }


    if ($("energyText")) {

      $("energyText").textContent =
        safeEnergy +
        " / " +
        safeMaxEnergy;
    }


    if ($("energyFill")) {

      const percent =
        Math.max(
          0,
          Math.min(
            100,
            (safeEnergy / safeMaxEnergy) * 100
          )
        );

      $("energyFill").style.width =
        percent + "%";
    }


    if ($("withdrawBalance")) {

      $("withdrawBalance").textContent =
        safeBalance.toLocaleString() +
        " SNP";
    }


    if ($("points")) {

      $("points").textContent =
        safeBalance.toLocaleString();
    }


    if ($("tapPower")) {

      $("tapPower").textContent =
        "x1";
    }
  }


  /*
   * Render username + balance immediately.
   */

  function renderUser() {

    renderTelegramUser();

    render();
  }


  /* =========================================================
     USER
     ========================================================= */

  async function loadUser() {

    if (!user?.id) {

      console.warn(
        "Telegram user not available yet"
      );

      return null;
    }

    try {

      /*
       * Show username before server request.
       */

      renderTelegramUser();


      const data = await api(
        "/api/user",
        {
          method: "POST",

          body: JSON.stringify({

            telegram_id: user.id,

            username:
              user.username ||
              user.first_name ||
              "",

            start_param:
              tg?.initDataUnsafe?.start_param ||
              ""
          })
        }
      );


      const serverUser =
        data?.user || null;


      if (!serverUser) {

        throw new Error(
          "User data not received"
        );
      }


      /*
       * SERVER IS THE SOURCE OF TRUTH.
       *
       * We intentionally do NOT load balance
       * from generic localStorage before this.
       *
       * This prevents Telegram account A
       * showing balance from account B.
       */

      balance =
        Number(serverUser.balance) || 0;

      energy =
        Number(serverUser.energy);

      if (!Number.isFinite(energy)) {
        energy = 1000;
      }

      maxEnergy =
        Number(serverUser.max_energy);

      if (
        !Number.isFinite(maxEnergy) ||
        maxEnergy <= 0
      ) {
        maxEnergy = 1000;
      }


      /*
       * Render immediately.
       * Do NOT wait for Daily / Tasks / Friends.
       */

      renderUser();


      /*
       * Save account-specific cache only AFTER
       * receiving verified server data.
       */

      saveUserCache(
        user.id,
        {
          balance,
          energy,
          maxEnergy
        }
      );


      /*
       * These are background requests.
       * They must NOT block balance display.
       */

      Promise.allSettled([

        loadBoosts(),

        loadDaily(),

        loadTasks(),

        loadFriends(),

        loadWallet()

      ]).catch(() => {});


      return serverUser;

    } catch (e) {

      console.error(
        "loadUser:",
        e
      );

      /*
       * Keep Telegram username visible.
       */

      renderTelegramUser();

      notify(
        e.message ||
        "Server connection failed"
      );

      return null;
    }
  }


  /* =========================================================
     ACCOUNT-SAFE CACHE
     ========================================================= */

  function cacheKey() {

    if (!user?.id) {
      return null;
    }

    return "sinaps_user_" + String(user.id);
  }


  function saveUserCache(id, data) {

    try {

      localStorage.setItem(
        "sinaps_user_" + String(id),
        JSON.stringify({

          balance: Number(data.balance) || 0,

          energy: Number(data.energy) || 0,

          maxEnergy:
            Number(data.maxEnergy) || 1000,

          savedAt: Date.now()
        })
      );

    } catch (_) {}
  }


  /*
   * Cache is NOT used as the initial source of truth.
   * It exists only for account-specific recovery.
   */

  function loadUserCache() {

    try {

      const key = cacheKey();

      if (!key) return null;

      const raw =
        localStorage.getItem(key);

      if (!raw) return null;

      const data =
        JSON.parse(raw);

      if (!data) return null;

      return data;

    } catch (_) {

      return null;
    }
  }


  /* =========================================================
     TAP
     ========================================================= */

  function tap(event) {

    if (!user?.id) {

      return;
    }

    if (energy <= 0) {

      notify("No energy");

      return;
    }


    const reward = 1;


    /*
     * Optimistic UI.
     * User sees +1 immediately.
     */

    balance += reward;

    energy -= 1;

    queue += 1;

    pending += 1;


    render();

    showTapNumber(
      event,
      reward
    );


    /*
     * Send taps shortly after.
     */

    if (!tapTimer) {

      tapTimer = setTimeout(
        flushTaps,
        100
      );
    }
  }


  let tapTimer = null;


  function showTapNumber(
    event,
    reward
  ) {

    const area =
      $("tapArea");

    if (!area) return;


    const rect =
      area.getBoundingClientRect();


    const x =
      event?.clientX ??
      (rect.left + rect.width / 2);


    const y =
      event?.clientY ??
      (rect.top + rect.height / 2);


    const floater =
      document.createElement("div");


    floater.className =
      "floater";


    floater.textContent =
      "+" + reward;


    floater.style.left =
      (x - rect.left) + "px";


    floater.style.top =
      (y - rect.top) + "px";


    if ($("floaters")) {

      $("floaters")
        .appendChild(floater);

    }


    setTimeout(
      () => floater.remove(),
      700
    );


    if ($("sCoin")) {

      $("sCoin")
        .classList.add("hit");


      setTimeout(
        () =>
          $("sCoin")
            .classList.remove("hit"),
        120
      );
    }
  }


  async function flushTaps() {

    clearTimeout(tapTimer);

    tapTimer = null;


    if (queue <= 0) {

      return;
    }


    const count =
      Math.min(queue, 50);


    queue -= count;


    try {

      /*
       * Send taps one-by-one if backend
       * only supports count-less endpoint.
       */

      for (
        let i = 0;
        i < count;
        i++
      ) {

        const data =
          await api(
            "/api/tap",
            {
              method: "POST",

              body: JSON.stringify({
                telegram_id: user.id
              })
            }
          );


        pending =
          Math.max(
            0,
            pending - 1
          );


        /*
         * Server balance is authoritative.
         *
         * Only update the visible balance
         * when all pending taps have arrived.
         */

        if (
          data?.user &&
          pending === 0 &&
          queue === 0
        ) {

          applyServerUser(
            data.user
          );
        }
      }

    } catch (e) {

      console.error(
        "flushTaps:",
        e
      );


      /*
       * Re-sync from server.
       */

      pending = 0;

      await loadUser();
    }


    if (queue > 0) {

      tapTimer =
        setTimeout(
          flushTaps,
          100
        );
    }
  }


  function applyServerUser(serverUser) {

    if (!serverUser) return;


    balance =
      Number(serverUser.balance) || 0;


    energy =
      Number(serverUser.energy);

    if (!Number.isFinite(energy)) {
      energy = 0;
    }


    maxEnergy =
      Number(serverUser.max_energy);

    if (
      !Number.isFinite(maxEnergy) ||
      maxEnergy <= 0
    ) {
      maxEnergy = 1000;
    }


    render();


    if (user?.id) {

      saveUserCache(
        user.id,
        {
          balance,
          energy,
          maxEnergy
        }
      );
    }
  }


  /* =========================================================
     ENERGY
     ========================================================= */

  function startEnergyTimer() {

    clearInterval(
      energyTimer
    );


    energyTimer =
      setInterval(
        () => {

          if (
            energy <
            maxEnergy
          ) {

            energy += 1;

            render();

            if (user?.id) {

              saveUserCache(
                user.id,
                {
                  balance,
                  energy,
                  maxEnergy
                }
              );
            }
          }

        },
        3000
      );
  }


  /* =========================================================
     NAVIGATION
     ========================================================= */

  function setupNavigation() {

    document
      .querySelectorAll(".nav-btn")
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {

            const page =
              button.dataset.page;

            document
              .querySelectorAll(".page")
              .forEach(
                (p) =>
                  p.classList.remove(
                    "active"
                  )
              );


            const target =
              $(page);

            if (target) {

              target.classList.add(
                "active"
              );
            }


            document
              .querySelectorAll(
                ".nav-btn"
              )
              .forEach(
                (b) =>
                  b.classList.remove(
                    "active"
                  )
              );


            button.classList.add(
              "active"
            );


            if (page === "tasks") {

              loadTasks();
            }


            if (page === "friends") {

              loadFriends();
            }


            if (page === "wallet") {

              loadHistory();
            }
          }
        );
      });
  }


  /* =========================================================
     TAP EVENT
     ========================================================= */

  function setupTap() {

    const area =
      $("tapArea");

    if (!area) return;


    area.addEventListener(
      "pointerdown",
      (event) => {

        event.preventDefault();

        tap(event);

      },
      {
        passive: false
      }
    );
  }


  /* =========================================================
     BOOSTS
     ========================================================= */

  async function loadBoosts() {

    try {

      const data =
        await api(
          "/api/boosts?telegram_id=" +
          encodeURIComponent(user.id)
        );


      if (
        data?.user
      ) {

        applyServerUser(
          data.user
        );
      }


      return data;

    } catch (e) {

      console.warn(
        "loadBoosts:",
        e.message
      );

      return null;
    }
  }


  /* =========================================================
     DAILY
     ========================================================= */

  async function loadDaily() {

    try {

      const data =
        await api(
          "/api/daily?telegram_id=" +
          encodeURIComponent(user.id)
        );


      const daily =
        data?.daily || {};


      const streak =
        Number(
          daily.streak || 0
        );


      const last =
        daily.last_claim_date;


      const today =
        new Date()
          .toISOString()
          .slice(0, 10);


      const grid =
        $("daysGrid");


      if (grid) {

        grid.innerHTML =
          Array.from(
            {
              length: 30
            },
            (_, i) => {

              const day =
                i + 1;


              const claimed =
                day <= streak &&
                last === today
                  ? "✓"
                  : "";


              const current =
                day === streak + 1;


              return `
                <button
                  class="day ${current ? "current" : ""}"
                  data-day="${day}"
                  ${current ? "" : "disabled"}
                >
                  <b>${day}</b>
                  <small>${day * 10}</small>
                  <span>${claimed}</span>
                </button>
              `;
            }
          ).join("");


        grid
          .querySelectorAll(
            ".day.current"
          )
          .forEach(
            (button) => {

              button.onclick =
                claimDaily;
            }
          );
      }


      if ($("dailyMsg")) {

        $("dailyMsg").textContent =
          last === today
            ? "Today claimed. Come back tomorrow."
            : "Claim the highlighted day.";
      }


      return data;

    } catch (e) {

      console.warn(
        "loadDaily:",
        e.message
      );

      if ($("dailyMsg")) {

        $("dailyMsg").textContent =
          e.message;
      }

      return null;
    }
  }


  async function claimDaily(event) {

    const button =
      event.currentTarget;


    button.disabled = true;


    try {

      const data =
        await api(
          "/api/daily/claim",
          {
            method: "POST",

            body: JSON.stringify({
              telegram_id: user.id
            })
          }
        );


      if (data?.user) {

        applyServerUser(
          data.user
        );
      } else if (
        data?.user?.balance
      ) {

        balance =
          Number(
            data.user.balance
          );

        render();
      }


      notify(
        "Day " +
        data.day +
        " claimed: +" +
        data.reward +
        " SNP",
        true
      );


      await loadDaily();

    } catch (e) {

      button.disabled = false;

      notify(
        e.message
      );
    }
  }


  function openDaily() {

    const modal =
      $("dailyModal");

    if (!modal) return;


    modal.classList.add(
      "show"
    );


    loadDaily();
  }


  /* =========================================================
     TASKS
     ========================================================= */

  async function loadTasks() {

    try {

      const data =
        await api(
          "/api/tasks?telegram_id=" +
          encodeURIComponent(user.id)
        );


      const list =
        $("tasksList");


      if (!list) return data;


      const tasks =
        data?.tasks || [];


      list.innerHTML =
        tasks.length
          ? tasks
              .map(
                (task) => `
                  <div class="task-row">
                    <div>
                      <b>${esc(task.title || task.name || "Task")}</b>
                      <small>
                        +${Number(task.reward || 0).toLocaleString()} SNP
                      </small>
                    </div>
                    <button
                      class="glow-btn task-btn"
                      data-task="${esc(task.id || "")}"
                    >
                      ${task.claimed ? "Claimed" : "Open"}
                    </button>
                  </div>
                `
              )
              .join("")
          : '<div class="empty">No tasks available.</div>';


      list
        .querySelectorAll(
          ".task-btn"
        )
        .forEach(
          (button) => {

            button.onclick =
              () =>
                claimTask(
                  button.dataset.task
                );
          }
        );


      return data;

    } catch (e) {

      console.warn(
        "loadTasks:",
        e.message
      );

      return null;
    }
  }


  async function claimTask(taskId) {

    try {

      const data =
        await api(
          "/api/tasks/claim",
          {
            method: "POST",

            body: JSON.stringify({
              telegram_id: user.id,
              task_id: taskId
            })
          }
        );


      if (data?.user) {

        applyServerUser(
          data.user
        );
      }


      notify(
        "Task completed",
        true
      );


      await loadTasks();

    } catch (e) {

      notify(
        e.message
      );
    }
  }


  /* =========================================================
     FRIENDS
     ========================================================= */

  async function loadFriends() {

    try {

      const data =
        await api(
          "/api/friends?telegram_id=" +
          encodeURIComponent(user.id)
        );


      if ($("refCode")) {

        $("refCode").textContent =
          data.referral_code || "-";

        $("refCode").dataset.code =
          data.referral_code || "";
      }


      if ($("refCount")) {

        $("refCount").textContent =
          data.referral_count || 0;
      }


      const list =
        data.friends || [];


      if ($("friendsList")) {

        $("friendsList").innerHTML =
          list.length
            ? list
                .map(
                  (friend) => `
                    <div class="friend-row">
                      <span>
                        ${esc(
                          friend.username ||
                          "User"
                        )}
                      </span>

                      <b>
                        ${Number(
                          friend.balance || 0
                        ).toLocaleString()}
                        SNP
                      </b>
                    </div>
                  `
                )
                .join("")
            : '<div class="empty">No invited users yet.</div>';
      }


      return data;

    } catch (e) {

      console.warn(
        "loadFriends:",
        e.message
      );

      return null;
    }
  }


  /* =========================================================
     HISTORY
     ========================================================= */

  async function loadHistory() {

    const box =
      $("historyList");


    if (!box || !user) {
      return;
    }


    try {

      const data =
        await api(
          "/api/history?telegram_id=" +
          encodeURIComponent(user.id)
        );


      const rows =
        data.transactions || [];


      box.innerHTML =
        rows.length
          ? rows
              .map(
                (row) => {

                  const amount =
                    Number(
                      row.amount || 0
                    );


                  return `
                    <div class="history-row">

                      <div>
                        <b>
                          ${esc(
                            String(
                              row.type || ""
                            )
                              .replaceAll(
                                "_",
                                " "
                              )
                          )}
                        </b>

                        <small>
                          ${esc(
                            row.description ||
                            ""
                          )}
                        </small>
                      </div>

                      <strong
                        class="${
                          amount < 0
                            ? "neg"
                            : "pos"
                        }"
                      >
                        ${
                          amount > 0
                            ? "+"
                            : ""
                        }${amount.toLocaleString()}
                        SNP
                      </strong>

                      <span>
                        ${esc(
                          row.status ||
                          ""
                        )}
                      </span>

                    </div>
                  `;
                }
              )
              .join("")
          : '<div class="empty">No transactions yet.</div>';

    } catch (e) {

      box.textContent =
        e.message;
    }
  }


  /* =========================================================
     WALLET
     ========================================================= */

  async function loadWallet() {

    try {

      const data =
        await api(
          "/api/wallet?telegram_id=" +
          encodeURIComponent(user.id)
        );


      const wallet =
        data?.wallet_address ||
        data?.wallet?.wallet_address ||
        data?.user?.wallet_address ||
        null;


      if (wallet) {

        renderWallet(
          wallet
        );
      }


      return data;

    } catch (e) {

      /*
       * Wallet endpoint may not exist in
       * some backend versions.
       * Do not block app startup.
       */

      console.warn(
        "loadWallet:",
        e.message
      );

      return null;
    }
  }


  function renderWallet(address) {

    if ($("walletAddress")) {

      $("walletAddress").style.display =
        address ? "block" : "none";
    }


    if ($("walletAddressText")) {

      $("walletAddressText").textContent =
        address || "";
    }


    if ($("wallet-mini")) {

      $("wallet-mini").textContent =
        address
          ? address.slice(0, 6) +
            "..." +
            address.slice(-6)
          : "Wallet not connected";
    }


    if ($("connectWalletBtn")) {

      $("connectWalletBtn").style.display =
        address ? "none" : "block";
    }


    if ($("disconnectWallet")) {

      $("disconnectWallet").style.display =
        address ? "block" : "none";
    }
  }


  async function setupWallet() {

    if (
      !window.TON_CONNECT_UI
    ) {

      console.warn(
        "TON Connect UI not loaded"
      );

      return;
    }


    try {

      tonUI =
        new window.TON_CONNECT_UI.TonConnectUI(
          {
            manifestUrl: MANIFEST,

            buttonRootId:
              "ton-connect"
          }
        );


      tonUI.onStatusChange(
        async (wallet) => {

          try {

            if (
              wallet?.account?.address
            ) {

              const address =
                wallet.account.address;


              renderWallet(
                address
              );


              /*
               * Save wallet for current
               * Telegram account.
               */

              await api(
                "/api/wallet/connect",
                {
                  method: "POST",

                  body:
                    JSON.stringify({
                      telegram_id:
                        user.id,

                      wallet_address:
                        address
                    })
                }
              );


              renderWallet(
                address
              );


              notify(
                "Wallet connected",
                true
              );

            } else {

              renderWallet(
                null
              );
            }

          } catch (e) {

            console.error(
              "Wallet status:",
              e
            );
          }
        }
      );


      if ($("connectWalletBtn")) {

        $("connectWalletBtn")
          .onclick = () => {

            tonUI.openModal();
          };
      }


      if ($("disconnectWallet")) {

        $("disconnectWallet")
          .onclick = async () => {

            try {

              await tonUI.disconnect();

              await api(
                "/api/wallet/disconnect",
                {
                  method: "POST",

                  body:
                    JSON.stringify({
                      telegram_id:
                        user.id
                    })
                }
              );


              renderWallet(
                null
              );


              notify(
                "Wallet disconnected",
                true
              );


            } catch (e) {

              notify(
                e.message
              );
            }
          };
      }

    } catch (e) {

      console.error(
        "TON Connect error:",
        e
      );
    }
  }


  /* =========================================================
     WITHDRAW
     ========================================================= */

  async function setupWithdraw() {

    const button =
      $("withdrawBtn");


    if (!button) {
      return;
    }


    button.onclick =
      async () => {

        if (withdrawing) {
          return;
        }


        withdrawing = true;

        button.disabled = true;


        try {

          /*
           * Flush pending taps first.
           */

          if (
            queue > 0
          ) {

            await flushTaps();
          }


          if (
            !tonUI ||
            !tonUI.wallet
          ) {

            throw new Error(
              "First connect your TON wallet."
            );
          }


          const amount =
            Number(
              $("withdrawAmount")
                ?.value
            );


          if (
            !Number.isInteger(
              amount
            ) ||
            amount <= 0
          ) {

            throw new Error(
              "Invalid SNP amount."
            );
          }


          if (
            amount > balance
          ) {

            throw new Error(
              "Insufficient SNP balance."
            );
          }


          /*
           * Create withdrawal request.
           */

          const data =
            await api(
              "/api/withdraw/request",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    telegram_id:
                      user.id,

                    amount,

                    wallet_address:
                      tonUI.wallet.account
                        .address
                  })
              }
            );


          if (
            data?.balance !== undefined
          ) {

            balance =
              Number(
                data.balance
              ) || balance;

            render();
          }


          notify(
            "Withdrawal request created. Send 0.1 TON fee.",
            true
          );


        } catch (e) {

          console.error(
            "withdraw:",
            e
          );

          notify(
            e.message
          );

        } finally {

          withdrawing =
            false;

          button.disabled =
            false;
        }
      };
  }


  /* =========================================================
     COPY REFERRAL
     ========================================================= */

  function setupReferralCopy() {

    const button =
      $("copyRef");


    if (!button) {
      return;
    }


    button.onclick =
      async () => {

        const code =
          $("refCode")
            ?.dataset
            ?.code ||
          $("refCode")
            ?.textContent ||
          "";


        if (!code || code === "-") {

          notify(
            "Referral code not ready"
          );

          return;
        }


        const link =
          "https://t.me/SNPCOINBot?startapp=" +
          encodeURIComponent(code);


        try {

          await navigator.clipboard.writeText(
            link
          );


          notify(
            "Invite link copied",
            true
          );

        } catch (_) {

          notify(
            link
          );
        }
      };
  }


  /* =========================================================
     DAILY GIFT
     ========================================================= */

  function setupDailyGift() {

    const gift =
      $("dailyGift");


    if (!gift) {
      return;
    }


    gift.onclick =
      openDaily;
  }


  /* =========================================================
     INIT
     ========================================================= */

  async function init() {

    try {

      /*
       * STEP 1
       * Telegram user is initialized FIRST.
       */

      telegram();


      /*
       * STEP 2
       * Immediately show username.
       */

      renderTelegramUser();


      /*
       * STEP 3
       * Render initial UI.
       */

      render();


      /*
       * STEP 4
       * Setup buttons/events.
       */

      setupNavigation();

      setupTap();

      setupReferralCopy();

      setupDailyGift();

      await setupWithdraw();


      /*
       * STEP 5
       * Load real server balance.
       *
       * IMPORTANT:
       * We await ONLY the user request here.
       *
       * Daily / Tasks / Friends / Wallet
       * are already running in background.
       */

      await loadUser();


      /*
       * STEP 6
       * Wallet starts AFTER current Telegram
       * user has been identified.
       */

      await setupWallet();


      /*
       * STEP 7
       * Energy starts.
       */

      startEnergyTimer();


      bootFinished = true;


      console.log(
        "SINAPS initialized",
        {
          telegram_id:
            user?.id,

          username:
            user?.username,

          balance,

          energy
        }
      );


    } catch (e) {

      console.error(
        "SINAPS INIT ERROR:",
        e
      );


      /*
       * Even if backend has an issue,
       * Telegram username should remain visible.
       */

      renderTelegramUser();

      render();

      notify(
        "SINAPS could not fully start"
      );
    }
  }


  /* =========================================================
     DOM READY
     ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();
  }

})();
