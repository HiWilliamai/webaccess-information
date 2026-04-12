import fs from "fs";
import path from "path";

const DEFAULT_INPUT_PATH = path.resolve("output", "theinformation-latest.json");
const DEFAULT_TEXT_PATH = path.resolve("output", "theinformation-latest.txt");
const DEFAULT_HTML_PATH = path.resolve("output", "theinformation-latest.html");

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) {
    return path.resolve(args[index + 1]);
  }
  return null;
}

function getPaths() {
  return {
    inputPath: getArgValue("--input") || process.env.THE_INFORMATION_INPUT_PATH || DEFAULT_INPUT_PATH,
    textPath: getArgValue("--text-output") || process.env.THE_INFORMATION_TEXT_OUTPUT_PATH || DEFAULT_TEXT_PATH,
    htmlPath: getArgValue("--html-output") || process.env.THE_INFORMATION_HTML_OUTPUT_PATH || DEFAULT_HTML_PATH
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  if (!value) return "";

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatList(items) {
  const values = (items || []).filter(Boolean);
  return values.length > 0 ? values.join("、") : "未提供";
}

function formatIssues(issues) {
  const values = (issues || []).filter(Boolean);
  return values.length > 0 ? values.join(" / ") : "无";
}

function articleStateLabel(article) {
  if ((article.issues || []).includes("cloudflare_challenge")) return "被 Cloudflare 拦截";
  if ((article.issues || []).includes("paywalled_or_teaser")) return "正文不完整";
  return "正文完整";
}

function sanitizeForFilename(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toBulletLines(items, emptyText = "无") {
  const values = (items || []).map((item) => normalizeText(item)).filter(Boolean);
  if (values.length === 0) return [`- ${emptyText}`];
  return values.map((item) => `- ${item}`);
}

function toHtmlList(items, emptyText = "无") {
  const values = (items || []).map((item) => normalizeText(item)).filter(Boolean);
  if (values.length === 0) {
    return `<li>${escapeHtml(emptyText)}</li>`;
  }
  return values.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function summarizeCoverage(data) {
  const cutoff = data.coverageWindow?.cutoffDateKey || "未知";
  const today = data.coverageWindow?.todayDateKey || "未知";
  return [
    `覆盖时间窗：${cutoff} 至 ${today}`,
    `候选文章数：${data.candidateCount ?? 0}`,
    `完成处理数：${data.completedArticleCount ?? 0}`,
    `正文完整文章数：${data.articleCount ?? 0}`,
    `正文不完整文章数：${data.partialArticleCount ?? 0}`,
    `被拦截文章数：${data.blockedArticleCount ?? 0}`,
    `未处理文章数：${data.unprocessedArticleCount ?? 0}`,
    `较早旧文排除数：${data.excludedOlderArticleCount ?? 0}`,
    `是否提前停止：${data.stoppedEarly ? `是（${data.stopReason || "未注明原因"}）` : "否"}`
  ];
}

function buildRunStatusSummary(data) {
  const parts = [];

  if (!data.ok) {
    parts.push("本次抓取失败");
  } else if ((data.articleCount ?? 0) > 0) {
    parts.push(`本次抓取成功，正文完整 ${data.articleCount} 篇`);
  } else {
    parts.push("本次抓取完成，但没有拿到正文完整文章");
  }

  if ((data.partialArticleCount ?? 0) > 0) {
    parts.push(`正文不完整 ${data.partialArticleCount} 篇`);
  } else {
    parts.push("没有正文不完整文章");
  }

  if ((data.blockedArticleCount ?? 0) > 0) {
    parts.push(`被拦截 ${data.blockedArticleCount} 篇`);
  } else {
    parts.push("没有被拦截文章");
  }

  if ((data.unprocessedArticleCount ?? 0) > 0) {
    parts.push(`未处理 ${data.unprocessedArticleCount} 篇`);
  } else {
    parts.push("没有未处理文章");
  }

  if (data.stoppedEarly) {
    parts.push(`本轮提前停止，原因：${data.stopReason || "未注明"}`);
  } else {
    parts.push("本轮未提前停止");
  }

  return parts;
}

function renderArticleText(article, index, sectionTitle) {
  const lines = [
    `${sectionTitle} #${index + 1}`,
    `标题：${normalizeText(article.title) || "未提供"}`,
    `栏目：${normalizeText(article.section) || "未提供"}`,
    `作者：${formatList(article.authors)}`,
    `发布时间：${normalizeText(article.publishedAtLocal) || normalizeText(article.publishedAtIso) || "未提供"}`,
    `链接：${normalizeText(article.canonicalUrl || article.url) || "未提供"}`,
    `状态：${articleStateLabel(article)}`,
    `抓取备注：${formatIssues(article.issues)}`,
    `抓取路径：${normalizeText(article.navigationMode) || "未提供"}`,
    ""
  ];

  lines.push("核心观点：");
  lines.push(...toBulletLines(article.takeaways, "未提取到单独 takeaway，建议结合全文阅读"));
  lines.push("");
  lines.push("关键数据：");
  lines.push(...toBulletLines(article.keyDataPoints, "未提取到关键数字句"));
  lines.push("");
  lines.push("导语：");
  lines.push(normalizeText(article.excerpt) || "未提供");
  lines.push("");
  lines.push("全文保留：");
  lines.push(normalizeText(article.text) || "未提供");

  return lines.join("\n");
}

function renderMetaListText(title, items, formatter) {
  const lines = [title];
  if (!items || items.length === 0) {
    lines.push("- 无");
    return lines.join("\n");
  }

  items.forEach((item, index) => {
    lines.push(formatter(item, index));
  });
  return lines.join("\n");
}

function renderTextReport(data) {
  const sections = [];
  const statusSummary = buildRunStatusSummary(data);
  sections.push("The Information 每日高颗粒度阅读稿");
  sections.push(`生成时间：${normalizeText(data.fetchedAt) || "未提供"}`);
  sections.push(`主页标题：${normalizeText(data.pageTitle) || "未提供"}`);
  sections.push(`主页提醒：${formatIssues(data.homeIssues)}`);
  sections.push("");
  sections.push("今日状态摘要");
  sections.push(...statusSummary.map((item) => `- ${item}`));
  sections.push("");
  sections.push("总览");
  sections.push(...summarizeCoverage(data));
  sections.push("");

  const fullArticles = data.articles || [];
  if (fullArticles.length > 0) {
    sections.push("正文完整文章");
    fullArticles.forEach((article, index) => {
      sections.push(renderArticleText(article, index, "文章"));
      sections.push("");
    });
  } else {
    sections.push("正文完整文章");
    sections.push("无");
    sections.push("");
  }

  sections.push(
    renderMetaListText("正文不完整文章", data.partialArticles, (item, index) =>
      [
        `- #${index + 1} ${normalizeText(item.title) || "未提供标题"}`,
        `  时间：${normalizeText(item.publishedAtLocal) || normalizeText(item.publishedAtIso) || "未提供"}`,
        `  链接：${normalizeText(item.canonicalUrl) || "未提供"}`,
        `  原因：${formatIssues(item.issues)}`
      ].join("\n")
    )
  );
  sections.push("");

  sections.push(
    renderMetaListText("被拦截文章", data.blockedArticles, (item, index) =>
      [
        `- #${index + 1} ${normalizeText(item.title) || "未提供标题"}`,
        `  时间：${normalizeText(item.publishedAtLocal) || normalizeText(item.publishedAtIso) || "未提供"}`,
        `  链接：${normalizeText(item.canonicalUrl) || "未提供"}`,
        `  原因：${formatIssues(item.issues)}`
      ].join("\n")
    )
  );
  sections.push("");

  sections.push(
    renderMetaListText("未处理文章", data.unprocessedArticles, (item, index) =>
      [
        `- #${index + 1} ${normalizeText(item.linkText) || "未提供标题"}`,
        `  链接：${normalizeText(item.canonicalUrl || item.clickUrl) || "未提供"}`,
        `  原因：${normalizeText(item.reason) || "未提供"}`
      ].join("\n")
    )
  );
  sections.push("");

  sections.push(
    renderMetaListText("时间窗外旧文", data.excludedOlderArticles, (item, index) =>
      [
        `- #${index + 1} ${normalizeText(item.title) || "未提供标题"}`,
        `  时间：${normalizeText(item.publishedAtLocal) || normalizeText(item.publishedAtIso) || "未提供"}`,
        `  链接：${normalizeText(item.canonicalUrl) || "未提供"}`
      ].join("\n")
    )
  );

  return `\uFEFF${sections.join("\n")}\n`;
}

function renderArticleHtml(article, index) {
  const takeaways = toHtmlList(article.takeaways, "未提取到单独 takeaway，建议结合全文阅读");
  const keyDataPoints = toHtmlList(article.keyDataPoints, "未提取到关键数字句");
  const fullText = escapeHtml(normalizeText(article.text) || "未提供");

  return `
    <article class="story-card">
      <div class="story-topline">
        <span class="story-index">文章 #${index + 1}</span>
        <span class="story-state">${escapeHtml(articleStateLabel(article))}</span>
      </div>
      <h2>${escapeHtml(normalizeText(article.title) || "未提供标题")}</h2>
      <div class="meta-grid">
        <div><strong>栏目</strong><span>${escapeHtml(normalizeText(article.section) || "未提供")}</span></div>
        <div><strong>作者</strong><span>${escapeHtml(formatList(article.authors))}</span></div>
        <div><strong>发布时间</strong><span>${escapeHtml(normalizeText(article.publishedAtLocal) || normalizeText(article.publishedAtIso) || "未提供")}</span></div>
        <div><strong>抓取路径</strong><span>${escapeHtml(normalizeText(article.navigationMode) || "未提供")}</span></div>
      </div>
      <p class="story-link"><a href="${escapeHtml(normalizeText(article.canonicalUrl || article.url) || "#")}">${escapeHtml(
        normalizeText(article.canonicalUrl || article.url) || "原文链接"
      )}</a></p>
      <section>
        <h3>核心观点</h3>
        <ul>${takeaways}</ul>
      </section>
      <section>
        <h3>关键数据</h3>
        <ul>${keyDataPoints}</ul>
      </section>
      <section>
        <h3>导语</h3>
        <p>${escapeHtml(normalizeText(article.excerpt) || "未提供")}</p>
      </section>
      <section>
        <h3>全文保留</h3>
        <pre>${fullText}</pre>
      </section>
    </article>
  `;
}

function renderCompactHtmlList(title, items, fields) {
  const values = items || [];
  const body =
    values.length === 0
      ? `<div class="compact-empty">无</div>`
      : values
          .map(
            (item, index) => `
            <div class="compact-card">
              <div class="compact-title">#${index + 1} ${escapeHtml(normalizeText(item.title || item.linkText) || "未提供标题")}</div>
              ${fields
                .map(
                  (field) => `
                <div class="compact-row">
                  <strong>${escapeHtml(field.label)}</strong>
                  <span>${escapeHtml(normalizeText(field.value(item)) || "未提供")}</span>
                </div>`
                )
                .join("")}
            </div>
          `
          )
          .join("");

  return `
    <section class="compact-section">
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

function renderHtmlReport(data) {
  const statusSummary = buildRunStatusSummary(data)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const overviewItems = summarizeCoverage(data)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const articleMarkup =
    (data.articles || []).length > 0
      ? (data.articles || []).map((article, index) => renderArticleHtml(article, index)).join("")
      : `<div class="compact-empty">今天没有正文完整的文章。</div>`;

  return `\uFEFF<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(`TI Daily Report ${data.coverageWindow?.todayDateKey || ""}`.trim())}</title>
    <style>
      :root {
        --bg: #f5efe3;
        --panel: #fffdf8;
        --ink: #1e1d1b;
        --muted: #665f55;
        --line: #d8c9aa;
        --accent: #9c3d1f;
        --accent-soft: #f0d9c7;
        --good: #2d6a4f;
        --warn: #925f00;
        --shadow: 0 18px 40px rgba(84, 57, 22, 0.12);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Georgia", "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(156, 61, 31, 0.12), transparent 28%),
          linear-gradient(180deg, #fbf6eb 0%, var(--bg) 100%);
      }
      .page {
        width: min(1200px, calc(100% - 32px));
        margin: 24px auto 56px;
      }
      .hero {
        background: linear-gradient(135deg, rgba(156, 61, 31, 0.95), rgba(55, 32, 17, 0.96));
        color: #fff8ee;
        border-radius: 28px;
        padding: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
        position: relative;
      }
      .hero::after {
        content: "";
        position: absolute;
        inset: auto -80px -80px auto;
        width: 220px;
        height: 220px;
        border-radius: 50%;
        background: rgba(255,255,255,0.08);
      }
      .eyebrow {
        font-size: 13px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        opacity: 0.8;
      }
      h1 {
        margin: 10px 0 8px;
        font-size: clamp(32px, 5vw, 52px);
        line-height: 0.96;
      }
      .hero-subtitle {
        max-width: 720px;
        line-height: 1.7;
        font-size: 16px;
        color: rgba(255, 248, 238, 0.88);
      }
      .hero-meta {
        margin-top: 18px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .hero-chip {
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        background: rgba(255,255,255,0.06);
      }
      .grid {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 20px;
        margin-top: 22px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 22px;
        box-shadow: var(--shadow);
      }
      .panel h2, .compact-section h2, .story-card h2 {
        margin: 0 0 12px;
      }
      .panel ul {
        margin: 0;
        padding-left: 20px;
        line-height: 1.7;
      }
      .status-panel {
        margin-top: 18px;
        background: linear-gradient(135deg, rgba(240, 217, 199, 0.9), rgba(255, 248, 238, 0.98));
      }
      .status-panel h2 {
        margin-bottom: 10px;
      }
      .story-stack {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .story-card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 22px;
        box-shadow: var(--shadow);
      }
      .story-topline {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }
      .story-index {
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .story-state {
        background: var(--accent-soft);
        color: var(--accent);
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 13px;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 14px 0 14px;
      }
      .meta-grid div {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border-top: 1px solid var(--line);
        padding-top: 10px;
      }
      .meta-grid strong {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .story-link a {
        color: var(--accent);
        word-break: break-all;
      }
      .story-card section {
        margin-top: 18px;
      }
      .story-card h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .story-card ul {
        margin: 0;
        padding-left: 20px;
        line-height: 1.7;
      }
      .story-card p {
        line-height: 1.8;
        margin: 0;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "Georgia", "Times New Roman", serif;
        line-height: 1.8;
        margin: 0;
        background: #fbf7ef;
        border: 1px solid #eadbc0;
        border-radius: 18px;
        padding: 16px;
      }
      .compact-section {
        margin-top: 18px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 22px;
        box-shadow: var(--shadow);
      }
      .compact-card + .compact-card {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
      }
      .compact-title {
        font-weight: 700;
        margin-bottom: 8px;
      }
      .compact-row {
        display: flex;
        gap: 8px;
        line-height: 1.7;
      }
      .compact-row strong {
        min-width: 74px;
        color: var(--muted);
      }
      .compact-empty {
        color: var(--muted);
      }
      .note {
        margin-top: 18px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.7;
      }
      @media (max-width: 900px) {
        .grid {
          grid-template-columns: 1fr;
        }
        .meta-grid {
          grid-template-columns: 1fr;
        }
        .page {
          width: min(100% - 18px, 1200px);
        }
        .hero, .panel, .story-card, .compact-section {
          border-radius: 20px;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="hero">
        <div class="eyebrow">The Information Daily Reading Pack</div>
        <h1>每日高颗粒度阅读稿</h1>
        <p class="hero-subtitle">这份文件保留了当天覆盖时间窗内的文章全文与结构化要点，按“正文完整 / 正文不完整 / 被拦截 / 未处理 / 时间窗外旧文”分开，方便你直接阅读、检索和留档。</p>
        <div class="hero-meta">
          <span class="hero-chip">生成时间：${escapeHtml(normalizeText(data.fetchedAt) || "未提供")}</span>
          <span class="hero-chip">覆盖时间窗：${escapeHtml(
            `${data.coverageWindow?.cutoffDateKey || "未知"} 至 ${data.coverageWindow?.todayDateKey || "未知"}`
          )}</span>
          <span class="hero-chip">主页提醒：${escapeHtml(formatIssues(data.homeIssues))}</span>
        </div>
      </header>

      <div class="grid">
        <aside class="panel">
          <h2>本次总览</h2>
          <ul>${overviewItems}</ul>
          <p class="note">正文完整文章是优先阅读区。正文不完整、被拦截和未处理文章会继续保留在下方，方便你补看，不会从报告里消失。</p>
        </aside>

        <main class="story-stack">
          <section class="story-card">
            <div class="story-topline">
              <span class="story-index">Primary Reading</span>
              <span class="story-state">正文完整 ${escapeHtml(String(data.articleCount ?? 0))} 篇</span>
            </div>
            <h2>正文完整文章</h2>
            <p>以下为覆盖时间窗内、当前判断正文完整的文章，保留导语、关键数据与全文。</p>
          </section>
          ${articleMarkup}
        </main>
      </div>

      <section class="panel status-panel">
        <h2>今日状态摘要</h2>
        <ul>${statusSummary}</ul>
      </section>

      ${renderCompactHtmlList("正文不完整文章", data.partialArticles, [
        { label: "时间", value: (item) => item.publishedAtLocal || item.publishedAtIso || "" },
        { label: "链接", value: (item) => item.canonicalUrl || "" },
        { label: "原因", value: (item) => formatIssues(item.issues) }
      ])}

      ${renderCompactHtmlList("被拦截文章", data.blockedArticles, [
        { label: "时间", value: (item) => item.publishedAtLocal || item.publishedAtIso || "" },
        { label: "链接", value: (item) => item.canonicalUrl || "" },
        { label: "原因", value: (item) => formatIssues(item.issues) }
      ])}

      ${renderCompactHtmlList("未处理文章", data.unprocessedArticles, [
        { label: "链接", value: (item) => item.canonicalUrl || item.clickUrl || "" },
        { label: "原因", value: (item) => item.reason || "" }
      ])}

      ${renderCompactHtmlList("时间窗外旧文", data.excludedOlderArticles, [
        { label: "时间", value: (item) => item.publishedAtLocal || item.publishedAtIso || "" },
        { label: "链接", value: (item) => item.canonicalUrl || "" }
      ])}
    </div>
  </body>
</html>`;
}

function main() {
  const { inputPath, textPath, htmlPath } = getPaths();
  const data = readJson(inputPath);

  const textContent = renderTextReport(data);
  const htmlContent = renderHtmlReport(data);

  fs.mkdirSync(path.dirname(textPath), { recursive: true });
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(textPath, textContent, "utf8");
  fs.writeFileSync(htmlPath, htmlContent, "utf8");

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
