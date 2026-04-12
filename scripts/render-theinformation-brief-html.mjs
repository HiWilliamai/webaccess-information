import fs from "fs";
import path from "path";

const DEFAULT_INPUT_PATH = path.resolve("output", "theinformation-brief.txt");
const DEFAULT_OUTPUT_PATH = path.resolve("output", "theinformation-brief.html");

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) {
    return path.resolve(args[index + 1]);
  }
  return null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      blocks.push({ type: "heading2", text: line.replace(/^##\s+/, "").trim() });
      index += 1;
      continue;
    }

    if (/^#\s+/.test(line)) {
      blocks.push({ type: "heading1", text: line.replace(/^#\s+/, "").trim() });
      index += 1;
      continue;
    }

    if (/^- /.test(line)) {
      const items = [];
      while (index < lines.length && /^- /.test(lines[index].trimEnd())) {
        items.push(lines[index].trimEnd().replace(/^- /, "").trim());
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const current = lines[index].trimEnd();
      if (!current.trim() || /^#/.test(current) || /^- /.test(current)) break;
      paragraphLines.push(current.trim());
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderHtmlFromBlocks(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "heading1") return `<h1>${escapeHtml(block.text)}</h1>`;
      if (block.type === "heading2") return `<h2>${escapeHtml(block.text)}</h2>`;
      if (block.type === "list") {
        return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      }
      return `<p>${escapeHtml(block.text)}</p>`;
    })
    .join("\n");
}

function main() {
  const inputPath = getArgValue("--input") || DEFAULT_INPUT_PATH;
  const outputPath = getArgValue("--output") || DEFAULT_OUTPUT_PATH;
  const sourceText = fs.readFileSync(inputPath, "utf8");
  const blocks = parseBlocks(sourceText);
  const content = renderHtmlFromBlocks(blocks);

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Information 中文高颗粒度摘要</title>
    <style>
      :root {
        --bg: #f7f4ec;
        --paper: #fffdf8;
        --ink: #1f1a16;
        --muted: #695d4d;
        --line: #d9ccb7;
        --accent: #8f2f17;
        --accent-soft: #f1dfd2;
        --shadow: 0 22px 48px rgba(79, 53, 21, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top right, rgba(143, 47, 23, 0.12), transparent 30%),
          linear-gradient(180deg, #fbf7ef 0%, var(--bg) 100%);
        color: var(--ink);
        font-family: "Georgia", "Times New Roman", serif;
      }
      .page {
        width: min(980px, calc(100% - 24px));
        margin: 24px auto 48px;
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .hero {
        padding: 28px 28px 18px;
        background: linear-gradient(135deg, rgba(143, 47, 23, 0.96), rgba(56, 35, 22, 0.96));
        color: #fff9f2;
      }
      .hero h1 {
        margin: 0;
        font-size: clamp(30px, 5vw, 46px);
        line-height: 1;
      }
      .hero p {
        margin: 12px 0 0;
        max-width: 760px;
        line-height: 1.7;
        color: rgba(255, 249, 242, 0.88);
      }
      .content {
        padding: 28px;
      }
      h1, h2 {
        margin-top: 0;
      }
      .content h1 {
        margin: 34px 0 10px;
        font-size: 28px;
        color: var(--accent);
      }
      .content h2 {
        margin: 24px 0 8px;
        font-size: 20px;
        color: var(--ink);
      }
      p {
        margin: 0 0 12px;
        line-height: 1.9;
        font-size: 16px;
      }
      ul {
        margin: 0 0 16px 0;
        padding-left: 22px;
      }
      li {
        margin: 0 0 10px;
        line-height: 1.85;
      }
      @media (max-width: 720px) {
        .page {
          width: min(100% - 14px, 980px);
          border-radius: 20px;
        }
        .hero, .content {
          padding: 18px;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="hero">
        <h1>The Information 中文高颗粒度摘要</h1>
        <p>这份页面基于当天抓取结果生成，保留逐篇中文分析结构，重点强化 Exclusive、OpenAI、Anthropic 与 AI 基础设施相关内容的颗粒度和优先级。</p>
      </div>
      <div class="content">
        ${content}
      </div>
    </div>
  </body>
</html>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        inputPath,
        outputPath
      },
      null,
      2
    )
  );
}

main();
