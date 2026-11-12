/** 常用网址三栏导航动效（来自静态工具网站 ui-motion.js） */
(function () {
  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function hasGsap() {
    return typeof gsap !== "undefined";
  }

  function animateNavSwitch() {
    if (reduced() || !hasGsap()) return;
    var active = document.querySelector(".link-nav-item.is-active");
    if (!active) return;
    gsap.fromTo(active, { scale: 0.92 }, { scale: 1, duration: 0.28, ease: "back.out(2)", clearProps: "transform" });
  }

  function animateVisibleItems() {
    if (reduced() || !hasGsap()) return;
    ["#list-links", "#list-file-paths", "#list-project-assets"].forEach(function (sel) {
      var items = gsap.utils.toArray(sel + " .link-bookmark:not([hidden])");
      if (!items.length) return;
      gsap.killTweensOf(items);
      gsap.fromTo(
        items,
        { opacity: 0.35, y: 8 },
        { opacity: 1, y: 0, duration: 0.28, stagger: 0.018, ease: "power2.out", clearProps: "opacity,transform" }
      );
    });
  }

  function bindPressFeedback() {
    if (reduced()) return;
    document.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var el = e.target.closest(".link-nav-item");
      if (!el || !hasGsap()) return;
      gsap.to(el, { scale: 0.96, duration: 0.07, ease: "power2.out", overwrite: "auto" });
    }, true);
    function release(e) {
      var el = e.target.closest(".link-nav-item");
      if (!el || !hasGsap()) return;
      gsap.to(el, { scale: 1, duration: 0.18, ease: "power2.out", clearProps: "transform" });
    }
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
  }

  bindPressFeedback();

  window.LinkMotion = {
    onFilterChange: function (reason) {
      if (reason === "tab") {
        animateNavSwitch();
        setTimeout(animateVisibleItems, 30);
      } else if (reason === "search") {
        animateVisibleItems();
      }
    },
  };
})();
