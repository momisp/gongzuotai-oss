/**
 * 全站 UI 微动效（壳层 + 通用按钮），不改各工具业务逻辑。
 * iframe 嵌入页仅淡入，不做 transform，避免点击偏移。
 */
(function () {
  var filterAnimTimer = null;
  var lastFilterKey = "";

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function hasGsap() {
    return typeof gsap !== "undefined";
  }

  function panelHasIframe(panel) {
    return !!(panel && panel.querySelector(".tool-game-embed, .tool-amap-embed, iframe"));
  }

  function animateToolPanel(panel) {
    if (!panel || reduced() || !hasGsap()) return;
    gsap.killTweensOf(panel);
    if (panelHasIframe(panel)) {
      gsap.fromTo(panel, { opacity: 0.55 }, { opacity: 1, duration: 0.28, ease: "power1.out", clearProps: "opacity" });
      return;
    }
    gsap.fromTo(
      panel,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.38, ease: "power2.out", clearProps: "opacity,transform" }
    );
  }

  function animateTabSwitch() {
    if (reduced() || !hasGsap()) return;
    var active = document.querySelector(".tool-category-tab.is-active");
    if (!active) return;
    gsap.fromTo(active, { scale: 0.92 }, { scale: 1, duration: 0.28, ease: "back.out(2)", clearProps: "transform" });
  }

  function animateVisibleCards() {
    if (reduced() || !hasGsap()) return;
    var cards = gsap.utils.toArray(".tool-card:not([hidden])");
    if (!cards.length) return;
    gsap.killTweensOf(cards);
    gsap.fromTo(
      cards,
      { opacity: 0.35, y: 8 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.018, ease: "power2.out", clearProps: "opacity,transform" }
    );
  }

  function animateCardTap(card) {
    if (!card || reduced() || !hasGsap()) return;
    gsap.fromTo(card, { scale: 0.96 }, { scale: 1, duration: 0.22, ease: "power2.out", clearProps: "transform" });
  }

  function animateEmptyState(show) {
    var empty = document.getElementById("tool-nav-empty");
    if (!empty || reduced() || !hasGsap()) return;
    gsap.killTweensOf(empty);
    if (show) {
      empty.hidden = false;
      gsap.fromTo(empty, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", clearProps: "opacity,transform" });
    }
  }

  function onFilterChange(reason) {
    var searchEl = document.getElementById("toolSearch");
    var q = (searchEl && searchEl.value.trim().toLowerCase()) || "";
    var key = reason + "|" + q;
    if (key === lastFilterKey) return;
    lastFilterKey = key;

    if (reason === "tab") {
      animateTabSwitch();
      window.setTimeout(animateVisibleCards, 30);
      return;
    }

    if (reason === "search") {
      window.clearTimeout(filterAnimTimer);
      filterAnimTimer = window.setTimeout(function () {
        var empty = document.getElementById("tool-nav-empty");
        var showEmpty = empty && !empty.hidden;
        if (showEmpty) animateEmptyState(true);
        else animateVisibleCards();
      }, 280);
    }
  }

  function bindPressFeedback() {
    if (reduced()) return;

    var pressSelector =
      ".button-group button, .tool-category-tab, .game-launch-card, .game-back-btn, " +
      ".sysmon-nav-item, .opscmd-copy-btn, .tl-btn-primary, .tl-btn-config, .tl-modal-close, " +
      ".her-preset-row button, #herChatSendBtn";

    document.addEventListener(
      "pointerdown",
      function (e) {
        if (e.button !== 0) return;
        var el = e.target.closest(pressSelector);
        if (!el || el.disabled || el.closest(".anim-preview-card")) return;
        if (!hasGsap()) {
          el.classList.add("ui-press");
          return;
        }
        gsap.to(el, { scale: 0.96, duration: 0.07, ease: "power2.out", overwrite: "auto" });
      },
      true
    );

    function release(e) {
      var el = e.target.closest(pressSelector);
      if (!el) return;
      if (!hasGsap()) {
        el.classList.remove("ui-press");
        return;
      }
      gsap.to(el, { scale: 1, duration: 0.18, ease: "power2.out", clearProps: "transform" });
    }

    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
  }

  function bindCardTap() {
    var nav = document.getElementById("tool-nav");
    if (!nav) return;
    nav.addEventListener("click", function (e) {
      var card = e.target.closest(".tool-card");
      if (card) animateCardTap(card);
    });
  }

  function onToolSwitch(prevId, nextId) {
    if (prevId === "animpreview" && nextId !== "animpreview" && typeof window._animPreviewKill === "function") {
      window._animPreviewKill();
    }
  }

  function init() {
    bindPressFeedback();
    bindCardTap();
  }

  window.UiMotion = {
    init: init,
    animateToolPanel: animateToolPanel,
    onFilterChange: onFilterChange,
    onToolSwitch: onToolSwitch,
    reduced: reduced,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
