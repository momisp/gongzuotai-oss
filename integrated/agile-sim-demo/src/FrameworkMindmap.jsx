/** 将「项目页面框架」Markdown 解析为树，供脑图渲染（支持缩进嵌套列表） */
export function parseFrameworkMd(md) {
  const lines = String(md || "").split(/\r?\n/);
  const root = { id: "root", title: "项目", intro: "", children: [] };
  // (heading_level, node)；root 视为 level 0
  const headingStack = [{ level: 0, node: root }];
  // (indent_spaces, node)
  let listStack = [];
  let idSeq = 0;
  const nid = () => `n${++idSeq}`;
  const headingParent = () => headingStack[headingStack.length - 1].node;

  for (const raw of lines) {
    if (!String(raw || "").trim()) continue;
    const line = String(raw || "").trim();

    const hm = /^(#{1,6})\s+(.+)$/.exec(line);
    if (hm) {
      const level = hm[1].length;
      const title = hm[2].trim().replace(/^#{1,6}\s+/, "");
      listStack = [];
      if (level === 1) {
        root.title = title
          .replace(/[·•]\s*页面框架\s*$/, "")
          .replace(/\s*页面框架\s*$/, "")
          .trim();
        headingStack.length = 0;
        headingStack.push({ level: 0, node: root });
        continue;
      }
      const node = { id: nid(), title, intro: "", children: [] };
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingParent().children.push(node);
      headingStack.push({ level, node });
      continue;
    }

    const bq = /^>\s*(?:业务简介\s*[:：]\s*)?(.+)$/.exec(line);
    if (bq) {
      const target = headingParent();
      target.intro = (target.intro ? `${target.intro} ` : "") + bq[1].trim();
      continue;
    }

    // 必须用原始行算缩进，否则弹窗与弹窗内条目会并排成同级
    const li = /^([ \t]*)[-*+]\s+(.+)$/.exec(String(raw || "").replace(/\r$/, ""));
    if (li) {
      const indent = li[1].replace(/\t/g, "  ").length;
      // 列表项里的 ### 是模型误写，不当标题；冒号后字段枚举拆子节点，不进 intro/备注
      let body = li[2].trim().replace(/^#{1,6}\s+/, "");
      let title = body;
      const children = [];
      const split = /^([^：:]{1,40})\s*[：:]\s*(.+)$/.exec(body);
      if (split) {
        const head = split[1].trim();
        const rest = split[2].trim();
        const parts = rest
          .split(/\s*\/\s*|、/)
          .map((p) => p.replace(/[，,].*$/, "").trim())
          .filter((p) => p && p.length <= 40);
        if (parts.length >= 2) {
          title = head;
          for (const p of parts) {
            children.push({ id: nid(), title: p, intro: "", children: [] });
          }
        }
      }
      const node = {
        id: nid(),
        title,
        intro: "",
        children,
      };
      while (listStack.length && listStack[listStack.length - 1].indent >= indent) {
        listStack.pop();
      }
      const parent = listStack.length
        ? listStack[listStack.length - 1].node
        : headingParent();
      parent.children.push(node);
      listStack.push({ indent, node });
    }
  }

  return root;
}

function MindNode({ node, depth = 0 }) {
  const hasKids = node.children && node.children.length > 0;
  const tip = node.intro || "";
  return (
    <li className={`mm-item mm-depth-${Math.min(depth, 4)}`}>
      <div
        className={"mm-node" + (depth === 0 ? " mm-root" : "") + (depth === 1 ? " mm-page" : "")}
        title={tip || undefined}
      >
        <span className="mm-node-title">{node.title}</span>
        {tip && depth > 0 ? (
          <span className="mm-node-intro">{tip}</span>
        ) : null}
      </div>
      {hasKids ? (
        <ul className="mm-branch">
          {node.children.map((c) => (
            <MindNode key={c.id || c.title} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * XMind 风格横向脑图（纯 CSS，无第三方依赖）
 */
export default function FrameworkMindmap({ markdown }) {
  const tree = parseFrameworkMd(markdown);
  if (!tree.children.length && !String(markdown || "").trim()) {
    return null;
  }
  return (
    <div className="mm-wrap" role="img" aria-label="项目页面框架脑图">
      <ul className="mm-tree">
        <MindNode node={tree} depth={0} />
      </ul>
    </div>
  );
}
