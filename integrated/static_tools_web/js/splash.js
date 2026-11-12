(function () {
  var SPLASH_KEY = "tools-site-splash-v1";
  var splashEl = document.getElementById("splash");
  if (!splashEl) return;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function splitTitle(titleEl) {
    if (!titleEl || titleEl.dataset.split) return;
    var text = titleEl.textContent;
    titleEl.textContent = "";
    titleEl.dataset.split = "1";
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement("span");
      span.className = "splash-char";
      span.textContent = text[i];
      titleEl.appendChild(span);
    }
  }

  function finish(onDone) {
    splashEl.setAttribute("aria-hidden", "true");
    splashEl.classList.add("splash--done");
    document.body.classList.remove("is-splash-active");
    document.documentElement.classList.remove("is-splash-active");
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    if (typeof gsap !== "undefined") {
      gsap.set(splashEl, { clearProps: "all" });
    }
    window.setTimeout(function () {
      if (splashEl.parentNode) splashEl.parentNode.removeChild(splashEl);
      if (typeof onDone === "function") onDone();
    }, 400);
  }

  function skip(onDone) {
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch (e) {}
    finish(onDone);
  }

  function animateMainContent() {
    if (typeof gsap === "undefined") return;
    var container = document.querySelector(".container");
    if (!container) return;

    var categories = container.querySelectorAll(".tool-category");
    if (!categories.length) return;

    gsap.from(container.querySelector("header"), {
      y: -20,
      opacity: 0,
      duration: 0.5,
      ease: "power3.out",
      clearProps: "opacity,transform",
    });

    gsap.from(container.querySelector(".tool-nav-bar"), {
      y: 16,
      opacity: 0,
      duration: 0.45,
      delay: 0.06,
      ease: "power2.out",
      clearProps: "opacity,transform",
    });

    gsap.from(categories, {
      y: 28,
      opacity: 0,
      duration: 0.4,
      stagger: 0.05,
      delay: 0.12,
      ease: "power2.out",
      clearProps: "opacity,transform",
    });

    gsap.from(container.querySelector("footer"), {
      opacity: 0,
      duration: 0.35,
      delay: 0.3,
      clearProps: "opacity",
    });
  }

  function runSplash(onDone) {
    splitTitle(document.querySelector(".splash-title"));

    var chars = splashEl.querySelectorAll(".splash-char");
    var symbols = splashEl.querySelectorAll(".splash-symbol");
    var logo = splashEl.querySelector(".splash-logo");
    var ring = splashEl.querySelector(".splash-ring");
    var tagline = splashEl.querySelector(".splash-tagline");
    var bar = splashEl.querySelector(".splash-progress-bar");
    var hint = splashEl.querySelector(".splash-skip-hint");
    var blobs = splashEl.querySelectorAll(".splash-blob");
    var skipped = false;
    var tl = null;

    function done() {
      if (skipped) return;
      skipped = true;
      if (tl) tl.kill();
      if (typeof gsap !== "undefined") {
        gsap.killTweensOf(splashEl);
        gsap.killTweensOf(splashEl.querySelectorAll("*"));
        gsap.killTweensOf(document.querySelectorAll(".splash-blob"));
      }
      try {
        sessionStorage.setItem(SPLASH_KEY, "1");
      } catch (e) {}
      finish(function () {
        if (typeof onDone === "function") onDone();
      });
    }

    splashEl.addEventListener("click", function () {
      done();
    });

    if (typeof gsap === "undefined") {
      done();
      return;
    }

    document.body.classList.add("is-splash-active");
    document.documentElement.classList.add("is-splash-active");

    gsap.set(splashEl, { autoAlpha: 1 });
    gsap.set(chars, { y: 60, autoAlpha: 0, rotationX: -70, transformOrigin: "50% 100%" });
    gsap.set(logo, { scale: 0, rotation: -180, autoAlpha: 0 });
    gsap.set(ring, { scale: 0.6, autoAlpha: 0, rotation: -90 });
    gsap.set(tagline, { y: 16, autoAlpha: 0 });
    gsap.set(bar, { scaleX: 0, transformOrigin: "0% 50%" });
    gsap.set(hint, { autoAlpha: 0 });
    gsap.set(symbols, { autoAlpha: 0, scale: 0 });

    tl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: done });

    gsap.to(blobs, {
      scale: 1.15,
      duration: 4,
      stagger: 0.3,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });

    tl.to(ring, { scale: 1, autoAlpha: 1, rotation: 0, duration: 0.7, ease: "back.out(1.4)" }, 0.1)
      .to(logo, { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.75, ease: "back.out(2)" }, 0.15)
      .to(
        chars,
        {
          y: 0,
          autoAlpha: 1,
          rotationX: 0,
          duration: 0.55,
          stagger: 0.07,
          ease: "back.out(1.6)",
        },
        0.35
      )
      .to(tagline, { y: 0, autoAlpha: 1, duration: 0.45 }, 0.75)
      .to(bar, { scaleX: 1, duration: 1.1, ease: "power2.inOut" }, 0.55)
      .to(symbols, {
        autoAlpha: 0.55,
        scale: 1,
        duration: 0.6,
        stagger: 0.08,
        ease: "back.out(1.5)",
      }, 0.4)
      .to(hint, { autoAlpha: 0.6, duration: 0.35 }, 1.0)
      .to(splashEl, {
        scale: 1.08,
        autoAlpha: 0,
        duration: 0.55,
        ease: "power2.inOut",
      }, 1.85)
      .to(symbols, { y: "-=40", autoAlpha: 0, duration: 0.45, stagger: 0.03 }, 1.75);

    gsap.to(ring, { rotation: 360, duration: 8, repeat: -1, ease: "none" });
    gsap.to(symbols, {
      y: "random(-18, 18)",
      x: "random(-12, 12)",
      rotation: "random(-12, 12)",
      duration: "random(2.5, 4)",
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      stagger: { each: 0.2, from: "random" },
    });
  }

  window.SplashScreen = {
    animateMainContent: animateMainContent,
    run: function (onDone) {
      if (prefersReducedMotion()) {
        skip(onDone);
        return;
      }
      try {
        if (sessionStorage.getItem(SPLASH_KEY) === "1") {
          skip(onDone);
          return;
        }
      } catch (e) {}

      if (document.readyState === "complete") {
        runSplash(onDone);
      } else {
        window.addEventListener("load", function () {
          runSplash(onDone);
        });
      }
    },
  };
})();
