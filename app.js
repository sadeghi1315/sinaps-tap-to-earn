/* =========================================
   SINAPS - SAFE CORE VERSION
   No Backend
   No TON Connect
========================================= */

(function () {

  "use strict";


  /* =========================================
     STATE
  ========================================= */

  let points = 0;
  let energy = 1000;
  let maxEnergy = 1000;
  let tapPower = 1;


  /* =========================================
     HELPERS
  ========================================= */

  function $(id) {
    return document.getElementById(id);
  }


  function render() {

    const balance = $("balance");

    if (balance) {
      balance.textContent =
        points.toLocaleString("en-US");
    }


    const energyText = $("energy");

    if (energyText) {
      energyText.textContent =
        Math.floor(energy) +
        " / " +
        maxEnergy;
    }


    const energyCurrent =
      $("energyCurrent");

    if (energyCurrent) {
      energyCurrent.textContent =
        Math.floor(energy);
    }


    const energyMax =
      $("energyMax");

    if (energyMax) {
      energyMax.textContent =
        maxEnergy;
    }


    const energyFill =
      $("energyFill");

    if (energyFill) {

      const percent =
        (energy / maxEnergy) * 100;

      energyFill.style.width =
        percent + "%";
    }


    const tapPowerElement =
      $("tapPower");

    if (tapPowerElement) {

      tapPowerElement.textContent =
        "x" + tapPower;
    }


    const level =
      $("level");

    if (level) {

      level.textContent =
        Math.floor(points / 1000) + 1;
    }
  }


  /* =========================================
     PAGE NAVIGATION
  ========================================= */

  function showPage(pageId) {

    const pages =
      document.querySelectorAll(".page");


    pages.forEach(function (page) {

      page.classList.remove("active");

    });


    const page =
      document.getElementById(pageId);


    if (page) {

      page.classList.add("active");

    }


    const navItems =
      document.querySelectorAll(".nav-item");


    navItems.forEach(function (item) {

      if (
        item.getAttribute("data-page") ===
        pageId
      ) {

        item.classList.add("active");

      } else {

        item.classList.remove("active");

      }

    });

  }


  function setupNavigation() {

    const navItems =
      document.querySelectorAll(".nav-item");


    console.log(
      "SINAPS NAV:",
      navItems.length
    );


    navItems.forEach(function (item) {

      item.addEventListener(
        "click",
        function () {

          const pageId =
            item.getAttribute("data-page");


          if (pageId) {

            showPage(pageId);

          }

        }
      );

    });

  }


  /* =========================================
     TOP WALLET BUTTON
  ========================================= */

  function setupWalletButton() {

    const button =
      $("walletTop");


    if (!button) {
      return;
    }


    button.addEventListener(
      "click",
      function () {

        showPage("walletPage");

      }
    );

  }


  /* =========================================
     TAP EFFECT
  ========================================= */

  function createTapEffect(
    event,
    amount
  ) {

    const container =
      $("floaters");


    if (!container) {
      return;
    }


    const element =
      document.createElement("div");


    element.className =
      "floater";


    element.textContent =
      "+" + amount;


    const rect =
      container.getBoundingClientRect();


    element.style.left =
      (
        event.clientX -
        rect.left
      ) + "px";


    element.style.top =
      (
        event.clientY -
        rect.top
      ) + "px";


    container.appendChild(element);


    setTimeout(
      function () {

        element.remove();

      },
      850
    );

  }


  /* =========================================
     LOGO MOVEMENT
  ========================================= */

  function moveLogo(event) {

    const logo =
      $("sLogo");


    if (!logo) {
      return;
    }


    const rect =
      logo.getBoundingClientRect();


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


    if (!distance) {
      return;
    }


    const amount =
      Math.min(
        18,
        distance * 0.06
      );


    const x =
      (dx / distance) * amount;


    const y =
      (dy / distance) * amount;


    logo.style.transform =
      "translate(" +
      x +
      "px, " +
      y +
      "px)";


    setTimeout(
      function () {

        logo.style.transform =
          "translate(0,0)";

      },
      180
    );

  }


  /* =========================================
     TAP
  ========================================= */

  function setupTap() {

    const tapArea =
      $("tapArea");


    if (!tapArea) {

      console.log(
        "SINAPS: tapArea NOT FOUND"
      );

      return;

    }


    tapArea.addEventListener(
      "click",
      function (event) {

        if (energy <= 0) {
          return;
        }


        points += tapPower;

        energy -= 1;


        render();


        createTapEffect(
          event,
          tapPower
        );


        moveLogo(event);

      }
    );

  }


  /* =========================================
     ENERGY REGEN
  ========================================= */

  function startEnergy() {

    setInterval(
      function () {

        if (energy < maxEnergy) {

          energy++;

          render();

        }

      },
      3000
    );

  }


  /* =========================================
     START
  ========================================= */

  function start() {

    console.log(
      "SINAPS SAFE CORE START"
    );


    render();

    setupNavigation();

    setupWalletButton();

    setupTap();

    startEnergy();


    console.log(
      "SINAPS SAFE CORE READY"
    );

  }


  /* =========================================
     DOM READY
  ========================================= */

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
