import fs from "fs";
import path from "path";

const DEFAULT_INPUT_PATH = path.resolve("output", "theinformation-brief.json");
const DEFAULT_TEXT_PATH = path.resolve("output", "theinformation-brief.txt");
const DEFAULT_HTML_PATH = path.resolve("output", "theinformation-brief.html");

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) {
    return path.resolve(args[index + 1]);
  }
  return null;
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listOrNone(items) {
  const values = (items || []).map((item) => normalizeText(item)).filter(Boolean);
  return values.length > 0 ? values : ["无"];
}

function renderBulletLines(items) {
  return listOrNone(items).map((item) => `- ${item}`);
}

function renderHtmlList(items) {
  return listOrNone(items)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderStructuredBlocksText(blocks) {
  const values = blocks || [];
  if (values.length === 0) {
    return ["### 无", "- 无"];
  }

  const lines = [];
  for (const block of values) {
    lines.push(`### ${normalizeText(block.heading) || "未提供"}`);
    const lead = normalizeText(block.lead);
    if (lead) {
      lines.push(lead);
    }
    lines.push(...renderBulletLines(block.bullets), "");
  }

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function renderStructuredBlocksHtml(blocks) {
  const values = blocks || [];
  if (values.length === 0) {
    return `
      <div class="structured-block">
        <h4>无</h4>
        <ul><li>无</li></ul>
      </div>
    `;
  }

  return values
    .map((block) => {
      const heading = escapeHtml(normalizeText(block.heading) || "未提供");
      const lead = normalizeText(block.lead);
      return `
        <div class="structured-block">
          <h4>${heading}</h4>
          ${lead ? `<p class="block-lead">${escapeHtml(lead)}</p>` : ""}
          <ul>${renderHtmlList(block.bullets)}</ul>
        </div>
      `;
    })
    .join("");
}

function renderMetadataLines(article) {
  return [
    `栏目：${normalizeText(article.section) || "未提供"}`,
    `作者：${normalizeText(article.authors) || "未提供"}`,
    `发布时间：${normalizeText(article.publication_time) || "未提供"}`,
    `原文链接：${normalizeText(article.original_link) || "未提供"}`
  ];
}

function renderTitleTranslationText(article) {
  const translation = normalizeText(article.title_translation);
  return translation ? [translation, ""] : [];
}

function renderArticleText(article) {
  return [
    `${normalizeText(article.title) || "未提供标题"}`,
    ...renderTitleTranslationText(article),
    ...renderMetadataLines(article),
    "",
    "##核心观点",
    normalizeText(article.core_viewpoint) || "未提供。",
    "",
    "##关键数据与事实（超高颗粒度）",
    ...renderStructuredBlocksText(article.key_data_sections),
    "",
    "##超高颗粒度洞察",
    ...renderStructuredBlocksText(article.insight_sections),
    "",
    "##为什么重要",
    normalizeText(article.why_it_matters) || "未提供。"
  ].join("\n");
}

function renderIssueMetadataLines(item) {
  return [
    `栏目：${normalizeText(item.section) || "未提供"}`,
    `发布时间：${normalizeText(item.publication_time) || "未提供"}`,
    `原文链接：${normalizeText(item.original_link) || "未提供"}`
  ];
}

function renderIssueArticleText(item) {
  return [
    `${normalizeText(item.title) || "未提供标题"}`,
    ...renderIssueMetadataLines(item),
    "",
    "##情况说明",
    normalizeText(item.issue_summary) || "未提供。",
    "",
    "##缺失信息",
    ...renderBulletLines(item.missing_details)
  ].join("\n");
}

function renderTextSection(title, items, renderer) {
  const lines = [`# ${title}`];
  if (!items || items.length === 0) {
    lines.push("- 无", "");
    return lines;
  }

  for (const item of items) {
    lines.push(renderer(item), "", "---", "");
  }

  lines.pop();
  lines.pop();
  return lines;
}

function renderText(data) {
  const lines = [];
  lines.push("# 今日状态摘要");
  lines.push(...renderBulletLines(data.today_status_summary));
  lines.push("");
  lines.push(...renderTextSection("重点文章", data.featured_articles, renderArticleText));
  lines.push(...renderTextSection("其他文章", data.other_articles, renderArticleText));
  lines.push(...renderTextSection("正文不完整文章", data.partial_articles, renderIssueArticleText));
  lines.push(...renderTextSection("被拦截文章", data.blocked_articles, renderIssueArticleText));
  lines.push(...renderTextSection("未处理文章", data.unprocessed_articles, renderIssueArticleText));
  return `\uFEFF${lines.join("\n").trim()}\n`;
}

function renderMetaGridHtml(lines) {
  return lines
    .map((line, index) => {
      const [label, ...rest] = line.split("：");
      const value = rest.join("：").trim();
      const wideClass = index === lines.length - 1 ? " wide" : "";
      const renderedValue =
        label === "原文链接"
          ? `<a href="${escapeHtml(value || "#")}">${escapeHtml(value || "未提供")}</a>`
          : escapeHtml(value || "未提供");
      return `<div class="${wideClass.trim()}"><strong>${escapeHtml(label)}</strong><span>${renderedValue}</span></div>`;
    })
    .join("");
}

function renderArticleHtml(article) {
  const titleTranslation = normalizeText(article.title_translation);

  return `
    <article class="article-card" data-title-translation="${escapeHtml(titleTranslation)}">
      <h2>${escapeHtml(normalizeText(article.title) || "未提供标题")}</h2>
      ${titleTranslation ? `<p class="title-translation">${escapeHtml(titleTranslation)}</p>` : ""}
      <div class="meta-grid">
        ${renderMetaGridHtml(renderMetadataLines(article))}
      </div>
      <section>
        <h3>核心观点</h3>
        <p>${escapeHtml(normalizeText(article.core_viewpoint) || "未提供。")}</p>
      </section>
      <section>
        <h3>关键数据与事实（超高颗粒度）</h3>
        ${renderStructuredBlocksHtml(article.key_data_sections)}
      </section>
      <section>
        <h3>超高颗粒度洞察</h3>
        ${renderStructuredBlocksHtml(article.insight_sections)}
      </section>
      <section>
        <h3>为什么重要</h3>
        <p>${escapeHtml(normalizeText(article.why_it_matters) || "未提供。")}</p>
      </section>
    </article>
  `;
}

function renderIssueArticleHtml(item) {
  const titleTranslation = normalizeText(item.title_translation);

  return `
    <article class="article-card compact" data-title-translation="${escapeHtml(titleTranslation)}">
      <h2>${escapeHtml(normalizeText(item.title) || "未提供标题")}</h2>
      <div class="meta-grid">
        ${renderMetaGridHtml(renderIssueMetadataLines(item))}
      </div>
      <section>
        <h3>情况说明</h3>
        <p>${escapeHtml(normalizeText(item.issue_summary) || "未提供。")}</p>
      </section>
      <section>
        <h3>缺失信息</h3>
        <ul>${renderHtmlList(item.missing_details)}</ul>
      </section>
    </article>
  `;
}

function renderHtmlSection(title, items, renderer) {
  const content = items && items.length > 0 ? items.map(renderer).join("") : `<div class="empty">无</div>`;
  return `
    <section class="section-block">
      <h1>${escapeHtml(title)}</h1>
      ${content}
    </section>
  `;
}

function renderHtml(data) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Information 中文高颗粒度阅读稿</title>
    <style>
      :root {
        --bg: #f6f1e6;
        --panel: #fffdf8;
        --ink: #1e1b18;
        --muted: #6a6156;
        --line: #dccfb8;
        --accent: #8f3218;
        --shadow: 0 20px 46px rgba(74, 48, 18, 0.12);
      }
      * { box-sizing: border-box; }
      html {
        scroll-behavior: smooth;
      }
      body {
        margin: 0;
        font-family: "Georgia", "Songti SC", "Noto Serif SC", "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(143, 50, 24, 0.12), transparent 28%),
          linear-gradient(180deg, #fbf8f2 0%, var(--bg) 100%);
      }
      .article-nav {
        position: fixed;
        top: 136px;
        left: clamp(14px, 1.6vw, 30px);
        z-index: 10;
        width: 300px;
        max-height: calc(100vh - 172px);
        overflow: auto;
        padding: 16px;
        border: 1px solid rgba(143, 50, 24, 0.22);
        border-radius: 18px;
        background: rgba(255, 253, 248, 0.72);
        box-shadow: 0 18px 42px rgba(74, 48, 18, 0.12);
        backdrop-filter: blur(10px);
      }
      .article-nav h2 {
        margin: 0 0 12px;
        color: var(--accent);
        font-size: 18px;
        line-height: 1.25;
      }
      .article-nav ol {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
        counter-reset: article-nav;
      }
      .article-nav li {
        counter-increment: article-nav;
      }
      .article-nav a {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 8px;
        align-items: start;
        padding: 9px 10px;
        border: 1px solid transparent;
        border-radius: 12px;
        color: var(--ink);
        text-decoration: none;
        line-height: 1.35;
        transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
      }
      .article-nav a::before {
        content: counter(article-nav, decimal-leading-zero);
        color: var(--accent);
        font-size: 12px;
        line-height: 1.6;
      }
      .article-nav a:hover,
      .article-nav a:focus-visible {
        border-color: rgba(143, 50, 24, 0.26);
        background: rgba(143, 50, 24, 0.08);
        color: var(--accent);
        outline: none;
      }
      .article-nav-text {
        min-width: 0;
      }
      .article-nav-title {
        display: block;
      }
      .article-nav-translation {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.45;
      }
      .article-nav a:hover .article-nav-translation,
      .article-nav a:focus-visible .article-nav-translation {
        color: var(--accent);
      }
      .page {
        width: min(1080px, calc(100% - 24px));
        margin: 24px auto 48px;
      }
      .hero {
        background: linear-gradient(135deg, rgba(143, 50, 24, 0.96), rgba(56, 35, 22, 0.97));
        color: #fff9f1;
        border-radius: 28px;
        padding: 28px;
        box-shadow: var(--shadow);
      }
      .hero h1 {
        margin: 0 0 10px;
        font-size: clamp(30px, 5vw, 48px);
        line-height: 0.96;
      }
      .hero p {
        margin: 0;
        max-width: 820px;
        line-height: 1.8;
        color: rgba(255, 249, 241, 0.9);
      }
      .summary-panel,
      .section-block {
        margin-top: 18px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 22px;
        box-shadow: var(--shadow);
      }
      .summary-panel h1,
      .section-block h1 {
        margin: 0 0 12px;
        font-size: 28px;
        color: var(--accent);
      }
      .summary-panel ul,
      .article-card ul {
        margin: 0;
        padding-left: 22px;
        line-height: 1.85;
      }
      .article-card {
        border-top: 1px solid var(--line);
        padding-top: 20px;
        margin-top: 20px;
        scroll-margin-top: 24px;
      }
      .article-card:first-of-type {
        border-top: none;
        padding-top: 0;
        margin-top: 0;
      }
      .article-card h2 {
        margin: 0 0 12px;
        font-size: 26px;
      }
      .title-translation {
        margin: -4px 0 14px;
        color: var(--accent);
        font-size: 20px;
        line-height: 1.65;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .meta-grid div {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border-top: 1px solid var(--line);
        padding-top: 10px;
      }
      .meta-grid .wide {
        grid-column: span 2;
      }
      .meta-grid strong {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .meta-grid a {
        color: var(--accent);
        word-break: break-all;
      }
      .article-card section {
        margin-top: 18px;
      }
      .article-card h3 {
        margin: 0 0 10px;
        font-size: 21px;
      }
      .article-card p {
        margin: 0;
        line-height: 1.95;
      }
      .structured-block {
        background: #fbf6ee;
        border: 1px solid #ecdfc9;
        border-radius: 18px;
        padding: 16px 18px;
      }
      .structured-block + .structured-block {
        margin-top: 12px;
      }
      .structured-block h4 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .block-lead {
        margin-bottom: 8px;
        color: var(--muted);
      }
      .empty {
        color: var(--muted);
      }
      @media (min-width: 1500px) {
        .page {
          margin-left: max(360px, calc((100vw - 1080px) / 2 + 44px));
          margin-right: auto;
        }
      }
      @media (max-width: 1499px) {
        .article-nav {
          position: static;
          width: min(1080px, calc(100% - 24px));
          max-height: min(38vh, 360px);
          margin: 16px auto 0;
        }
        .article-nav ol {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 720px) {
        .page {
          width: min(100% - 16px, 1080px);
        }
        .article-nav {
          width: min(100% - 16px, 1080px);
          max-height: 280px;
          padding: 14px;
        }
        .article-nav ol {
          grid-template-columns: 1fr;
          gap: 6px;
        }
        .article-nav a {
          padding: 8px;
        }
        .hero,
        .summary-panel,
        .section-block {
          border-radius: 20px;
          padding: 18px;
        }
        .meta-grid {
          grid-template-columns: 1fr;
        }
        .meta-grid .wide {
          grid-column: span 1;
        }
      }
    </style>
  </head>
  <body>
    <nav class="article-nav" aria-label="文章目录">
      <h2>文章目录</h2>
      <ol id="articleNavList"></ol>
    </nav>
    <div class="page">
      <header class="hero">
        <h1>The Information 中文高颗粒度阅读稿</h1>
        <p>按篇输出核心观点、关键数据与事实、超高颗粒度洞察和为什么重要，优先突出重点文章，并单独标记不完整、被拦截或未处理的稿件。</p>
      </header>

      <section class="summary-panel">
        <h1>今日状态摘要</h1>
        <ul>${renderHtmlList(data.today_status_summary)}</ul>
      </section>

      ${renderHtmlSection("重点文章", data.featured_articles, renderArticleHtml)}
      ${renderHtmlSection("其他文章", data.other_articles, renderArticleHtml)}
      ${renderHtmlSection("正文不完整文章", data.partial_articles, renderIssueArticleHtml)}
      ${renderHtmlSection("被拦截文章", data.blocked_articles, renderIssueArticleHtml)}
      ${renderHtmlSection("未处理文章", data.unprocessed_articles, renderIssueArticleHtml)}
    </div>
    <script>
      (() => {
        const navList = document.querySelector("#articleNavList");
        const cards = [...document.querySelectorAll(".section-block .article-card")];

        cards.forEach((card, index) => {
          const title = card.querySelector("h2");
          if (!title) return;
          const translation = card.querySelector(".title-translation");
          const heading = title.textContent.trim();

          const id = \`article-\${index + 1}\`;
          card.id = id;

          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = \`#\${id}\`;

          const textWrap = document.createElement("span");
          textWrap.className = "article-nav-text";

          const titleText = document.createElement("span");
          titleText.className = "article-nav-title";
          titleText.textContent = heading;
          textWrap.appendChild(titleText);

          const translatedHeading = translation?.textContent.trim() || card.dataset.titleTranslation?.trim();
          if (translatedHeading) {
            const translationText = document.createElement("span");
            translationText.className = "article-nav-translation";
            translationText.textContent = translatedHeading;
            textWrap.appendChild(translationText);
          }

          link.appendChild(textWrap);
          item.appendChild(link);
          navList.appendChild(item);
        });
      })();
    </script>
  </body>
</html>`;
}

function main() {
  const inputPath = getArgValue("--input") || DEFAULT_INPUT_PATH;
  const textPath = getArgValue("--text-output") || DEFAULT_TEXT_PATH;
  const htmlPath = getArgValue("--html-output") || DEFAULT_HTML_PATH;
  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  fs.mkdirSync(path.dirname(textPath), { recursive: true });
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(textPath, renderText(data), "utf8");
  fs.writeFileSync(htmlPath, renderHtml(data), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        inputPath,
        textPath,
        htmlPath
      },
      null,
      2
    )
  );
}

main();
