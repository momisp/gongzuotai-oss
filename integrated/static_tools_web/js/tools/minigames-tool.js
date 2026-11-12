/**
 * 小游戏 x13：合集入口 + 各游戏 iframe 游玩
 */

function miniGameCap(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function miniGameSrc(path) {
  return "./games/x13/" + path;
}

function renderGamePlayer(container, game) {
  container.innerHTML =
    "<div class=\"game-tool-head\">" +
    "<button type=\"button\" class=\"game-back-btn\" id=\"miniGameBack\">← 返回合集</button>" +
    "<h2>" +
    (game.icon ? game.icon + " " : "") +
    game.name +
    "</h2>" +
    "<p>" +
    game.tag +
    "</p>" +
    "</div>" +
    "<iframe class=\"tool-game-embed\" title=\"" +
    game.name +
    "\" src=\"" +
    miniGameSrc(game.path) +
    "\"></iframe>";

  var back = document.getElementById("miniGameBack");
  if (back) {
    back.addEventListener("click", function () {
      showTool("minigames");
    });
  }
}

function renderMinigamesTool(container) {
  var list = window.MINI_GAMES || [];
  var cards = list
    .map(function (g) {
      return (
        '<button type="button" class="game-launch-card" data-tool="' +
        g.toolId +
        '">' +
        '<span class="game-launch-icon">' +
        g.icon +
        "</span>" +
        '<span class="game-launch-info"><strong>' +
        g.name +
        "</strong><small>" +
        g.tag +
        "</small></span>" +
        '<span class="game-launch-arrow">›</span></button>'
      );
    })
    .join("");

  container.innerHTML =
    "<h2>小游戏合集 x13</h2>" +
    "<p>共 " +
    list.length +
    " 款本地静态小游戏，点击名称在下方区域游玩；也可在首页「游戏」分类里单独打开某一款。</p>" +
    '<div class="game-launch-grid">' +
    cards +
    "</div>" +
    '<p class="game-open-hint">也可<a href="./games/x13/index.html" target="_blank" rel="noopener">在新标签页打开完整合集</a>。</p>';

  container.querySelectorAll(".game-launch-card").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-tool");
      if (id) showTool(id);
    });
  });
}

(function registerMiniGameRenderers() {
  var list = window.MINI_GAMES || [];
  for (var i = 0; i < list.length; i++) {
    (function (game) {
      var fn = "render" + miniGameCap(game.toolId) + "Tool";
      window[fn] = function (container) {
        renderGamePlayer(container, game);
      };
    })(list[i]);
  }
})();
