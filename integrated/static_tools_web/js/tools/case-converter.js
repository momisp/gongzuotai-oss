function renderCaseTool(container) {
  container.innerHTML =
    "<h2>命名转换</h2>" +
    "<p>支持驼峰、下划线、横线、大驼峰等格式互转</p>" +
    '<textarea id="caseInput" placeholder="例如 user_name、user-name、userName"></textarea>' +
    '<div class="button-group">' +
    '<button type="button" onclick="toCamelCase()">驼峰 (userName)</button>' +
    '<button type="button" onclick="toSnakeCase()">下划线 (user_name)</button>' +
    '<button type="button" onclick="toKebabCase()">横线 (user-name)</button>' +
    '<button type="button" onclick="toPascalCase()">大驼峰 (UserName)</button>' +
    "</div>" +
    '<div class="button-group">' +
    '<button type="button" onclick="clearCase()">清空</button>' +
    "</div>" +
    '<pre id="caseOutput" class="output"></pre>';
}

function caseCapitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function tokenizeCaseInput(input) {
  return input
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function convertCase(input, type) {
  const words = tokenizeCaseInput(input);
  if (!words.length) return "";

  switch (type) {
    case "camel":
      return (
        words[0] +
        words
          .slice(1)
          .map((w) => caseCapitalize(w))
          .join("")
      );
    case "snake":
      return words.join("_");
    case "kebab":
      return words.join("-");
    case "pascal":
      return words.map((w) => caseCapitalize(w)).join("");
    default:
      return "";
  }
}

function toCamelCase() {
  applyCase("camel");
}

function toSnakeCase() {
  applyCase("snake");
}

function toKebabCase() {
  applyCase("kebab");
}

function toPascalCase() {
  applyCase("pascal");
}

function applyCase(type) {
  const inputEl = document.getElementById("caseInput");
  const outEl = document.getElementById("caseOutput");
  if (!inputEl || !outEl) return;
  const input = inputEl.value.trim();
  if (!input) {
    outEl.textContent = "请输入要转换的命名";
    return;
  }
  const result = convertCase(input, type);
  outEl.textContent = result || "无法从当前输入解析出有效片段";
}

function clearCase() {
  const inputEl = document.getElementById("caseInput");
  const outEl = document.getElementById("caseOutput");
  if (inputEl) inputEl.value = "";
  if (outEl) outEl.textContent = "";
}
