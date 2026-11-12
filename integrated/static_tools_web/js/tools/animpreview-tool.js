/**
 * GSAP 多场景动画预览
 */
(function () {
  var contexts = {};

  var DEMOS = [
    {
      id: "fade-up",
      title: "淡入上移",
      scene: "页面元素入场",
      desc: "opacity + y，适合标题、卡片首次出现",
      ease: "power2.out",
    },
    {
      id: "elastic",
      title: "弹性缩放",
      scene: "按钮 / Logo 弹入",
      desc: "scale + back.out 缓动，有轻微 overshoot",
      ease: "back.out(2)",
    },
    {
      id: "stagger",
      title: "交错入场",
      scene: "列表 / 网格",
      desc: "多个子元素 stagger 依次出现",
      ease: "power3.out",
    },
    {
      id: "timeline",
      title: "时间轴序列",
      scene: "步骤引导 / 叙事",
      desc: "timeline 按顺序播放多段动画",
      ease: "power2.inOut",
    },
    {
      id: "easing",
      title: "缓动对比",
      scene: "挑选缓动曲线",
      desc: "相同位移，不同 ease 效果对比",
      ease: "—",
    },
    {
      id: "loop",
      title: "循环呼吸",
      scene: "加载 / 强调",
      desc: "yoyo 往复，适合 pulse 提示",
      ease: "sine.inOut",
    },
    {
      id: "flip",
      title: "3D 翻转",
      scene: "卡片翻面",
      desc: "rotationY 展示正反面",
      ease: "power2.inOut",
    },
    {
      id: "counter",
      title: "数字滚动",
      scene: "统计 / 倒计时",
      desc: "gsap.to 驱动数值变化",
      ease: "power1.out",
    },
    {
      id: "scroll",
      title: "滚动驱动",
      scene: "长页滚动联动",
      desc: "ScrollTrigger scrub 随滚动播放",
      ease: "none (scrub)",
    },
    {
      id: "typewriter",
      title: "文字逐字",
      scene: "标题 / Slogan",
      desc: "字符 stagger 依次显现",
      ease: "power2.out",
    },
    {
      id: "shake",
      title: "错误抖动",
      scene: "表单校验 / 提示",
      desc: "x 轴快速往复，引起注意",
      ease: "power2.inOut",
    },
    {
      id: "clip-wipe",
      title: "遮罩擦除",
      scene: "图片 / 横幅入场",
      desc: "clip-path 从左侧擦除揭示",
      ease: "power3.inOut",
    },
    {
      id: "slide-drawer",
      title: "抽屉滑入",
      scene: "侧边栏 / 面板",
      desc: "xPercent 从屏外滑入",
      ease: "power3.out",
    },
    {
      id: "bounce-drop",
      title: "坠落弹跳",
      scene: "掉落物 / 徽章",
      desc: "自上方掉落并弹跳落地",
      ease: "bounce.out",
    },
    {
      id: "loading-dots",
      title: "三点加载",
      scene: "请求等待",
      desc: "圆点交替缩放，无限循环",
      ease: "sine.inOut",
    },
    {
      id: "toast",
      title: "通知弹入",
      scene: "Toast / Snackbar",
      desc: "从顶部滑入，停留后淡出",
      ease: "back.out(1.4)",
    },
    {
      id: "progress",
      title: "进度填充",
      scene: "上传 / 任务进度",
      desc: "进度条宽度平滑增长",
      ease: "power2.inOut",
    },
    {
      id: "skeleton",
      title: "骨架闪烁",
      scene: "内容加载占位",
      desc: "渐变光带扫过 skeleton",
      ease: "none",
    },
    {
      id: "parallax",
      title: "视差层叠",
      scene: "Hero / 头图",
      desc: "多层元素以不同速率移动",
      ease: "power1.out",
    },
    {
      id: "orbit",
      title: "轨道旋转",
      scene: "图标环绕 / 加载",
      desc: "子元素绕中心公转",
      ease: "none",
    },
    {
      id: "accordion",
      title: "手风琴展开",
      scene: "FAQ / 折叠面板",
      desc: "height 动画展开内容区",
      ease: "power2.inOut",
    },
    {
      id: "ripple",
      title: "点击波纹",
      scene: "Material 按钮",
      desc: "ripple 圆从中心扩散",
      ease: "power2.out",
    },
    {
      id: "blur-in",
      title: "模糊渐入",
      scene: "模态 / 浮层",
      desc: "filter blur + scale 组合入场",
      ease: "power2.out",
    },
    {
      id: "swing",
      title: "钟摆摇摆",
      scene: "挂饰 / 提示铃铛",
      desc: "rotation 原点摇摆衰减",
      ease: "sine.inOut",
    },
    {
      id: "morph-color",
      title: "颜色 morph",
      scene: "状态切换",
      desc: "背景色 + 圆角平滑过渡",
      ease: "power2.inOut",
    },
    {
      id: "path-draw",
      title: "路径描边",
      scene: "图标 / Logo",
      desc: "strokeDashoffset 描绘 SVG",
      ease: "power2.inOut",
    },
  ];

  var DEFERRED_DEMOS = ["scroll"];

  function killCtx() {
    Object.keys(contexts).forEach(function (key) {
      if (contexts[key]) contexts[key].revert();
    });
    contexts = {};
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.getAll().forEach(function (st) {
      st.kill();
    });
  }

  function runDemo(root, demoId) {
    if (typeof gsap === "undefined") return;
    var stage = root.querySelector('[data-demo-stage="' + demoId + '"]');
    if (!stage) return;

    if (contexts[demoId]) {
      contexts[demoId].revert();
      delete contexts[demoId];
    }

    contexts[demoId] = gsap.context(function () {
      var fn = runners[demoId];
      if (fn) fn(stage);
    }, stage);

    if (demoId === "scroll" && typeof ScrollTrigger !== "undefined") {
      ScrollTrigger.refresh();
    }
  }

  var runners = {
    "fade-up": function (stage) {
      var box = stage.querySelector(".ap-box");
      gsap.fromTo(box, { y: 48, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power2.out" });
    },

    elastic: function (stage) {
      var box = stage.querySelector(".ap-box");
      gsap.fromTo(box, { scale: 0, rotation: -120, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.85, ease: "back.out(2.5)" });
    },

    stagger: function (stage) {
      var items = stage.querySelectorAll(".ap-stagger-item");
      gsap.fromTo(items, { y: 32, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.1, ease: "power3.out" });
    },

    timeline: function (stage) {
      var steps = stage.querySelectorAll(".ap-step");
      var bar = stage.querySelector(".ap-tl-bar");
      gsap.set(steps, { opacity: 0.25, scale: 0.92 });
      gsap.set(bar, { scaleX: 0, transformOrigin: "0% 50%" });
      var tl = gsap.timeline();
      tl.to(bar, { scaleX: 1, duration: 1.2, ease: "power2.inOut" })
        .to(steps[0], { opacity: 1, scale: 1, duration: 0.35 }, 0.15)
        .to(steps[1], { opacity: 1, scale: 1, duration: 0.35 }, 0.45)
        .to(steps[2], { opacity: 1, scale: 1, duration: 0.35 }, 0.75)
        .to(steps[3], { opacity: 1, scale: 1, duration: 0.35 }, 1.05);
    },

    easing: function (stage) {
      var rows = stage.querySelectorAll(".ap-ease-row");
      rows.forEach(function (row) {
        var dot = row.querySelector(".ap-ease-dot");
        var ease = row.dataset.ease;
        gsap.fromTo(dot, { x: 0 }, { x: row.clientWidth - 28, duration: 1.4, ease: ease, repeat: 1, yoyo: true });
      });
    },

    loop: function (stage) {
      var ring = stage.querySelector(".ap-pulse-ring");
      var core = stage.querySelector(".ap-pulse-core");
      gsap.to(ring, { scale: 1.45, opacity: 0, duration: 1.2, repeat: -1, ease: "sine.out" });
      gsap.to(core, { scale: 1.12, duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut" });
    },

    flip: function (stage) {
      var card = stage.querySelector(".ap-flip-card");
      gsap.to(card, { rotationY: 180, duration: 0.7, ease: "power2.inOut", yoyo: true, repeat: 1 });
    },

    counter: function (stage) {
      var num = stage.querySelector(".ap-counter-num");
      var obj = { val: 0 };
      gsap.to(obj, {
        val: 9876,
        duration: 1.6,
        ease: "power1.out",
        onUpdate: function () {
          num.textContent = Math.round(obj.val).toLocaleString();
        },
      });
    },

    scroll: function (stage) {
      if (typeof ScrollTrigger === "undefined") {
        stage.querySelector(".ap-scroll-hint").textContent = "ScrollTrigger 未加载";
        return;
      }
      gsap.registerPlugin(ScrollTrigger);
      var scroller = stage.querySelector(".ap-scroll-wrap");
      var fill = stage.querySelector(".ap-scroll-fill");
      var blocks = stage.querySelectorAll(".ap-scroll-block");
      gsap.set(fill, { scaleY: 0, transformOrigin: "50% 100%" });
      gsap.set(blocks, { opacity: 0.3, x: -20 });
      gsap.to(fill, {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: scroller,
          scroller: scroller,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
        },
      });
      blocks.forEach(function (block) {
        gsap.to(block, {
          opacity: 1,
          x: 0,
          scrollTrigger: {
            trigger: block,
            scroller: scroller,
            start: "top 80%",
            end: "top 30%",
            scrub: 0.3,
          },
        });
      });
    },

    typewriter: function (stage) {
      var chars = stage.querySelectorAll(".ap-tw-char");
      gsap.fromTo(chars, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.08, stagger: 0.06, ease: "power2.out" });
    },

    shake: function (stage) {
      var box = stage.querySelector(".ap-shake-box");
      gsap.fromTo(box, { x: 0 }, { x: -8, duration: 0.06, repeat: 5, yoyo: true, ease: "power2.inOut" });
      gsap.to(box, { x: 0, duration: 0.1, delay: 0.36 });
    },

    "clip-wipe": function (stage) {
      var panel = stage.querySelector(".ap-clip-panel");
      gsap.fromTo(panel, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.9, ease: "power3.inOut" });
    },

    "slide-drawer": function (stage) {
      var drawer = stage.querySelector(".ap-drawer");
      gsap.fromTo(drawer, { xPercent: -110 }, { xPercent: 0, duration: 0.65, ease: "power3.out" });
    },

    "bounce-drop": function (stage) {
      var ball = stage.querySelector(".ap-ball");
      gsap.fromTo(ball, { y: -100, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "bounce.out" });
    },

    "loading-dots": function (stage) {
      var dots = stage.querySelectorAll(".ap-dot");
      gsap.to(dots, { y: -10, duration: 0.35, stagger: 0.15, repeat: -1, yoyo: true, ease: "sine.inOut" });
    },

    toast: function (stage) {
      var toast = stage.querySelector(".ap-toast");
      gsap.set(toast, { y: -60, opacity: 0, xPercent: -50, left: "50%" });
      var tl = gsap.timeline();
      tl.to(toast, { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.5)" })
        .to(toast, { opacity: 1, duration: 0.8 })
        .to(toast, { y: -20, opacity: 0, duration: 0.4, ease: "power2.in" });
    },

    progress: function (stage) {
      var bar = stage.querySelector(".ap-prog-fill");
      var label = stage.querySelector(".ap-prog-label");
      gsap.set(bar, { scaleX: 0, transformOrigin: "0% 50%" });
      gsap.to(bar, {
        scaleX: 1,
        duration: 1.4,
        ease: "power2.inOut",
        onUpdate: function () {
          if (label) label.textContent = Math.round(this.progress() * 100) + "%";
        },
      });
    },

    skeleton: function (stage) {
      var shine = stage.querySelector(".ap-skel-shine");
      gsap.fromTo(shine, { xPercent: -120 }, { xPercent: 220, duration: 1.2, repeat: 2, ease: "none" });
    },

    parallax: function (stage) {
      var layers = stage.querySelectorAll(".ap-parallax-layer");
      gsap.fromTo(layers[0], { x: -30, opacity: 0.5 }, { x: 20, opacity: 1, duration: 1.2, ease: "power1.out" });
      gsap.fromTo(layers[1], { x: 40, opacity: 0.5 }, { x: -15, opacity: 1, duration: 1.2, ease: "power1.out" });
      gsap.fromTo(layers[2], { y: 20, opacity: 0 }, { y: -10, opacity: 1, duration: 1, ease: "power2.out" });
    },

    orbit: function (stage) {
      var ring = stage.querySelector(".ap-orbit-ring");
      gsap.fromTo(ring, { rotation: 0 }, { rotation: 360, duration: 2.5, ease: "none", repeat: 1 });
    },

    accordion: function (stage) {
      var body = stage.querySelector(".ap-acc-body");
      var inner = stage.querySelector(".ap-acc-inner");
      gsap.set(body, { height: 0, opacity: 0 });
      gsap.to(body, { height: inner.offsetHeight, opacity: 1, duration: 0.55, ease: "power2.inOut" });
    },

    ripple: function (stage) {
      var ripples = stage.querySelectorAll(".ap-ripple");
      ripples.forEach(function (r, i) {
        gsap.set(r, { scale: 0, opacity: 0.6 });
        gsap.to(r, { scale: 2.5, opacity: 0, duration: 0.8, delay: i * 0.15, ease: "power2.out" });
      });
    },

    "blur-in": function (stage) {
      var modal = stage.querySelector(".ap-blur-modal");
      gsap.fromTo(modal, { scale: 0.85, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.65, ease: "power2.out" });
    },

    swing: function (stage) {
      var bell = stage.querySelector(".ap-swing-bell");
      gsap.fromTo(bell, { rotation: -18 }, { rotation: 18, duration: 0.18, repeat: 5, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 0%" });
      gsap.to(bell, { rotation: 0, duration: 0.2, delay: 1.1, ease: "power1.out" });
    },

    "morph-color": function (stage) {
      var shape = stage.querySelector(".ap-morph-shape");
      var tl = gsap.timeline();
      tl.to(shape, { borderRadius: "50%", backgroundColor: "#9b59b6", duration: 0.5, ease: "power2.inOut" })
        .to(shape, { borderRadius: "8px", backgroundColor: "#1abc9c", scale: 1.15, duration: 0.5, ease: "power2.inOut" })
        .to(shape, { borderRadius: "24px", backgroundColor: "#3498db", scale: 1, duration: 0.5, ease: "power2.inOut" });
    },

    "path-draw": function (stage) {
      var path = stage.querySelector(".ap-svg-path");
      if (!path || !path.getTotalLength) return;
      var len = path.getTotalLength();
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
      gsap.to(path, { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" });
    },
  };

  function stageHtml(demo) {
    var id = demo.id;
    var wrap = function (inner) {
      return '<div class="ap-stage" data-demo-stage="' + id + '">' + inner + "</div>";
    };
    var center = function (inner) {
      return '<div class="ap-stage ap-stage-center" data-demo-stage="' + id + '">' + inner + "</div>";
    };

    if (id === "stagger") {
      return wrap(
        '<div class="ap-stagger-grid">' +
        [1, 2, 3, 4, 5, 6].map(function (n) {
          return '<span class="ap-stagger-item">' + n + "</span>";
        }).join("") +
        "</div>"
      );
    }
    if (id === "timeline") {
      return wrap(
        '<div class="ap-tl-bar"></div><div class="ap-steps">' +
        ["准备", "处理", "校验", "完成"].map(function (t, i) {
          return '<span class="ap-step">' + (i + 1) + ". " + t + "</span>";
        }).join("") +
        "</div>"
      );
    }
    if (id === "easing") {
      var eases = [["linear", "linear"], ["power2.out", "power2.out"], ["back.out(2)", "back.out"], ["elastic.out(1,0.4)", "elastic"]];
      return (
        '<div class="ap-stage ap-stage-easing" data-demo-stage="' + id + '">' +
        eases.map(function (e) {
          return '<div class="ap-ease-row" data-ease="' + e[0] + '"><span class="ap-ease-label">' + e[1] +
            '</span><span class="ap-ease-track"><span class="ap-ease-dot"></span></span></div>';
        }).join("") +
        "</div>"
      );
    }
    if (id === "loop") return center('<span class="ap-pulse-ring"></span><span class="ap-pulse-core"></span>');
    if (id === "flip") {
      return center(
        '<div class="ap-flip-card"><div class="ap-flip-face ap-flip-front">正面</div>' +
        '<div class="ap-flip-face ap-flip-back">背面</div></div>'
      );
    }
    if (id === "counter") return center('<span class="ap-counter-num">0</span>');
    if (id === "scroll") {
      return (
        '<div class="ap-stage ap-stage-scroll" data-demo-stage="' + id + '">' +
        '<p class="ap-scroll-hint">在下方区域滚动预览</p><div class="ap-scroll-wrap">' +
        '<div class="ap-scroll-fill"></div>' +
        [1, 2, 3, 4].map(function (n) { return '<div class="ap-scroll-block">区块 ' + n + "</div>"; }).join("") +
        "</div></div>"
      );
    }
    if (id === "typewriter") {
      var text = "Hello, GSAP!";
      return center(
        '<p class="ap-typewriter">' +
        text.split("").map(function (ch) {
          return '<span class="ap-tw-char">' + (ch === " " ? "&nbsp;" : ch) + "</span>";
        }).join("") +
        "</p>"
      );
    }
    if (id === "shake") return center('<div class="ap-shake-box">!</div>');
    if (id === "clip-wipe") return center('<div class="ap-clip-panel">Wipe</div>');
    if (id === "slide-drawer") {
      return wrap('<div class="ap-drawer"><span>菜单面板</span><ul><li>首页</li><li>设置</li></ul></div>');
    }
    if (id === "bounce-drop") return center('<span class="ap-ball"></span>');
    if (id === "loading-dots") {
      return center([0, 1, 2].map(function () { return '<span class="ap-dot"></span>'; }).join(""));
    }
    if (id === "toast") return wrap('<div class="ap-toast">✓ 操作成功</div>');
    if (id === "progress") {
      return wrap(
        '<div class="ap-prog-wrap"><div class="ap-prog-track"><div class="ap-prog-fill"></div></div>' +
        '<span class="ap-prog-label">0%</span></div>'
      );
    }
    if (id === "skeleton") {
      return wrap(
        '<div class="ap-skel-card"><div class="ap-skel-line ap-skel-line--short"></div>' +
        '<div class="ap-skel-line"></div><div class="ap-skel-line"></div>' +
        '<span class="ap-skel-shine"></span></div>'
      );
    }
    if (id === "parallax") {
      return wrap(
        '<div class="ap-parallax-scene">' +
        '<span class="ap-parallax-layer ap-parallax-layer--back">☁</span>' +
        '<span class="ap-parallax-layer ap-parallax-layer--mid">🏔</span>' +
        '<span class="ap-parallax-layer ap-parallax-layer--front">🌲</span></div>'
      );
    }
    if (id === "orbit") {
      return center(
        '<div class="ap-orbit-wrap"><div class="ap-orbit-ring">' +
        [0, 1, 2, 3].map(function () { return '<span class="ap-orbit-item"></span>'; }).join("") +
        '</div><span class="ap-orbit-core"></span></div>'
      );
    }
    if (id === "accordion") {
      return wrap(
        '<div class="ap-acc"><div class="ap-acc-head">常见问题 ▾</div>' +
        '<div class="ap-acc-body"><div class="ap-acc-inner">这是展开后的详细说明内容，用于 FAQ 或折叠面板场景。</div></div></div>'
      );
    }
    if (id === "ripple") {
      return center(
        '<button type="button" class="ap-ripple-btn">' +
        [0, 1].map(function () { return '<span class="ap-ripple"></span>'; }).join("") +
        "点击</button>"
      );
    }
    if (id === "blur-in") return center('<div class="ap-blur-modal">Modal</div>');
    if (id === "swing") return center('<span class="ap-swing-bell">🔔</span>');
    if (id === "morph-color") return center('<span class="ap-morph-shape"></span>');
    if (id === "path-draw") {
      return center(
        '<svg class="ap-svg" viewBox="0 0 80 80" width="80" height="80">' +
        '<path class="ap-svg-path" d="M10,40 Q25,10 40,40 T70,40" fill="none" stroke="#3498db" stroke-width="3" stroke-linecap="round"/></svg>'
      );
    }
    return center('<span class="ap-box">GSAP</span>');
  }

  function renderAnimpreviewTool(container) {
    killCtx();

    var cards = DEMOS.map(function (demo) {
      return (
        '<article class="anim-preview-card" data-demo="' +
        demo.id +
        '">' +
        '<div class="anim-preview-card-head">' +
        '<span class="anim-preview-scene">' +
        demo.scene +
        "</span>" +
        "<h3>" +
        demo.title +
        "</h3>" +
        "<p>" +
        demo.desc +
        "</p>" +
        '<code class="anim-preview-ease">' +
        demo.ease +
        "</code>" +
        "</div>" +
        stageHtml(demo) +
        '<button type="button" class="anim-preview-replay" data-replay="' +
        demo.id +
        '">▶ 回放</button>' +
        "</article>"
      );
    }).join("");

    container.innerHTML =
      "<h2>动画效果预览</h2>" +
      "<p>基于 GSAP，共 " +
      DEMOS.length +
      " 种场景：入场、序列、缓动、循环、翻转、计数、滚动、通知、骨架屏等。点击「回放」可重新播放。</p>" +
      '<div class="anim-preview-grid">' +
      cards +
      "</div>";

    container.querySelectorAll(".anim-preview-replay").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        runDemo(container, btn.dataset.replay);
      });
    });

    container.querySelectorAll(".anim-preview-card").forEach(function (card) {
      card.addEventListener("click", function () {
        runDemo(container, card.dataset.demo);
      });
    });

    DEMOS.forEach(function (demo) {
      if (DEFERRED_DEMOS.indexOf(demo.id) === -1) runDemo(container, demo.id);
    });
    window.setTimeout(function () {
      DEFERRED_DEMOS.forEach(function (id) {
        runDemo(container, id);
      });
    }, 120);
  }

  window.renderAnimpreviewTool = renderAnimpreviewTool;
  window._animPreviewKill = killCtx;
})();
