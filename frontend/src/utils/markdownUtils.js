/**
 * 极简 Markdown → HTML — utils 层
 *
 * 只有一个使用场景：从外部复制 markdown **源文本**粘进富文本编辑器时，把它转成 HTML。
 * wangEditor 自己不做 markdown 解析，而浏览器在「纯文本粘贴」时只给 text/plain，
 * 于是 `行内代码`、**粗体** 这些标记会被原样当成文字插进去（就是「粘贴后格式丢失」）。
 *
 * 覆盖的语法（够用即可，刻意保持小）：
 *   围栏代码块 ``` ``` / ATX 标题 #~###### / 无序列表 - * + / 有序列表 1.
 *   引用 > / 分隔线 --- / 行内代码 `x` / 粗体 **x** / 斜体 *x* / 删除线 ~~x~~ / 链接 [t](u)
 *
 * ⚠ 不是完整的 CommonMark 实现（下划线式粗斜体、表格、嵌套列表缩进等都没做）。
 *   真要全覆盖，换成 marked / markdown-it 之类的库，再把 customPaste 里的
 *   markdownToHtml 换掉即可。
 */

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ESCAPE_MAP[ch]);
}

/**
 * 判断一段纯文本「像不像 markdown」
 * 没有任何标记就别转，免得把正常文本改坏（比如把 `2*3*4` 当成斜体）
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeMarkdown(text) {
  return /```|`[^`]+`|^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|---)|(\*\*|~~|\[[^\]]+\]\([^)\s]+\))/m.test(
    String(text)
  );
}

/**
 * 行内语法 → HTML
 *
 * 做法：先用「带捕获组的 split」把行内代码切出来，只对代码以外的片段套
 * 粗体 / 斜体 / 删除线 / 链接 —— 否则代码里的 `**`、`*x*` 会被当成强调处理。
 * （早先版本是拿 \u0000 当占位符再替换回去，简陋且会被 ESLint 的
 *   no-control-regex 拦下；按片段处理既不用魔法字符，也少一次正则替换。）
 */
function inline(raw) {
  return String(raw)
    // 捕获取会保留分隔符 → 数组里「普通片段」与「`代码片段`」交替出现
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 2 && part.charAt(0) === "`" && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return escapeHtml(part)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => `<a href="${href}">${label}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/~~([^~]+)~~/g, "<s>$1</s>");
    })
    .join("");
}

/**
 * Markdown 源文本 → HTML
 * 按行做块级解析，段内的行合并成同一个 <p>（和 markdown 的行为一致）
 * @param {string} md
 * @returns {string} html
 */
export function markdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listTag = "";
  let fence = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listTag) {
      html.push(`</${listTag}>`);
      listTag = "";
    }
  };

  lines.forEach((raw) => {
    const line = raw.replace(/\s+$/, "");

    // 围栏代码块：``` 之间原样收进 <pre><code>
    if (/^\s*```/.test(line)) {
      if (fence === null) {
        flushParagraph();
        closeList();
        fence = [];
      } else {
        html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
        fence = null;
      }
      return;
    }
    if (fence !== null) {
      fence.push(raw);
      return;
    }

    // 空行：断开段落与列表
    if (!line.trim()) {
      flushParagraph();
      closeList();
      return;
    }

    // 标题
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      return;
    }

    // 分隔线
    if (/^\s{0,3}(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push("<hr>");
      return;
    }

    // 引用
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      return;
    }

    // 列表（同类型连续行合并成同一个 ul / ol）
    const ulItem = line.match(/^\s*[-*+]\s+(.*)$/);
    const olItem = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ulItem || olItem) {
      flushParagraph();
      const tag = ulItem ? "ul" : "ol";
      if (listTag !== tag) {
        closeList();
        html.push(`<${tag}>`);
        listTag = tag;
      }
      html.push(`<li>${inline((ulItem || olItem)[1])}</li>`);
      return;
    }

    closeList();
    paragraph.push(line.trim());
  });

  if (fence !== null) html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join("");
}
