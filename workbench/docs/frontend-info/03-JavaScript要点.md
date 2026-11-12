# JavaScript 要点

## 语法底线

- `let/const`、函数、数组方法（`map/filter/find`）
- 对象与解构（会读即可）
- 模块：以后框架项目里的 `import/export`

## DOM 与事件

```js
const btn = document.querySelector("#save");
btn.addEventListener("click", () => {
  // 改文本、加 class、读 input.value
});
```

- 优先 `querySelector`；列表用事件委托减少绑定
- 表单：`submit` 里 `event.preventDefault()`

## 异步与接口

```js
const res = await fetch("/api/xxx");
const data = await res.json();
```

- 会处理：loading、空数组、`!res.ok` 报错提示
- 会在 DevTools → Network 核对请求

## 练习题

1. 点击按钮切换一段文字显示/隐藏  
2. 输入框实时显示字数  
3. `fetch` 公共 JSON（或自己的 FastAPI）渲染成列表  

## 对照

- 路径 L2：`01-前端知识学习目录.md`  
- 网络：javascript.info · MDN JavaScript · fetch
