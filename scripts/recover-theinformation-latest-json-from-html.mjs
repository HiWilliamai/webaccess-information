import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) return path.resolve(args[index + 1]);
  return null;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCount(text, label) {
  const match = text.match(new RegExp(`${label}[:：]\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

function parseOverview(text) {
  const coverageMatch = text.match(/覆盖时间窗[:：]\s*(\d{4}-\d{2}-\d{2})\s*至\s*(\d{4}-\d{2}-\d{2})/);
  return {
    coverageWindow: {
      timeZone: "Asia/Shanghai",
      lookbackDays: 1,
      generatedAtIso: new Date().toISOString(),
      cutoffDateKey: coverageMatch?.[1] || null,
      todayDateKey: coverageMatch?.[2] || null
    },
    candidateCount: parseCount(text, "候选文章数"),
    completedArticleCount: parseCount(text, "完成处理数"),
    articleCount: parseCount(text, "正文完整文章数"),
    partialArticleCount: parseCount(text, "正文不完整文章数"),
    blockedArticleCount: parseCount(text, "被拦截文章数"),
    unprocessedArticleCount: parseCount(text, "未处理文章数"),
    excludedOlderArticleCount: parseCount(text, "较早旧文排除数"),
    stoppedEarly: /是否提前停止[:：]\s*是/.test(text)
  };
}

function parseIssueText(value) {
  const text = normalizeText(value);
  if (!text || text === "无") return [];
  return text.split(/\s*\/\s*/).map((item) => item.trim()).filter(Boolean);
}

function parseAuthors(value) {
  const text = normalizeText(value);
  if (!text || text === "未提供") return [];
  return text.split(/[、,]/).map((item) => item.trim()).filter(Boolean);
}

function parseStoryCard(card) {
  const metaValues = Array.from(card.querySelectorAll(".meta-grid div span")).map((node) =>
    normalizeText(node.textContent)
  );
  const sectionNodes = Array.from(card.querySelectorAll("section"));
  const listItems = (sectionIndex) =>
    Array.from(sectionNodes[sectionIndex]?.querySelectorAll("li") || [])
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean);

  const title = normalizeText(card.querySelector("h2")?.textContent);
  const canonicalUrl = normalizeText(card.querySelector(".story-link a")?.getAttribute("href"));
  const text = normalizeText(card.querySelector("pre")?.textContent);

  return {
    url: canonicalUrl,
    canonicalUrl,
    linkText: title,
    title,
    excerpt: normalizeText(sectionNodes[2]?.querySelector("p")?.textContent),
    issues: [],
    fetchAttempt: 1,
    navigationMode: metaValues[3] && metaValues[3] !== "未提供" ? metaValues[3] : "recovered_from_html",
    section: metaValues[0] && metaValues[0] !== "未提供" ? metaValues[0] : null,
    authors: parseAuthors(metaValues[1]),
    publishedAtIso: null,
    publishedAtLocal: metaValues[2] && metaValues[2] !== "未提供" ? metaValues[2] : null,
    publishedDateKey: null,
    modifiedAtIso: null,
    takeaways: listItems(0).filter((item) => !item.includes("未提取到")),
    keyDataPoints: listItems(1).filter((item) => !item.includes("未提取到")),
    text
  };
}

function parseCompactSection(section) {
  return Array.from(section.querySelectorAll(".compact-card")).map((card) => {
    const title = normalizeText(card.querySelector(".compact-title")?.textContent).replace(/^#\d+\s+/, "");
    const values = Array.from(card.querySelectorAll(".compact-row span")).map((node) => normalizeText(node.textContent));
    return {
      title,
      canonicalUrl: values.find((value) => /^https?:\/\//.test(value)) || "",
      issues: parseIssueText(values[values.length - 1]),
      publishedAtIso: null,
      publishedAtLocal: values.find((value) => !/^https?:\/\//.test(value) && !value.includes("paywalled")) || null,
      publishedDateKey: null
    };
  });
}

function main() {
  const htmlPath = getArgValue("--html");
  const textPath = getArgValue("--text");
  const outputPath = getArgValue("--output");
  if (!htmlPath || !textPath || !outputPath) {
    throw new Error("Missing required args: --html, --text, --output");
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const text = fs.readFileSync(textPath, "utf8");
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const overview = parseOverview(text);
  const articleCards = Array.from(document.querySelectorAll("article.story-card")).filter(
    (card) => card.querySelector(".story-link a") && card.querySelector("pre")
  );
  const compactSections = Array.from(document.querySelectorAll("section.compact-section"));
  const sectionByHeading = new Map(
    compactSections.map((section) => [normalizeText(section.querySelector("h2")?.textContent), section])
  );

  const partialSection = [...sectionByHeading.entries()].find(([heading]) => heading.includes("正文不完整"))?.[1];
  const blockedSection = [...sectionByHeading.entries()].find(([heading]) => heading.includes("拦截"))?.[1];
  const unprocessedSection = [...sectionByHeading.entries()].find(([heading]) => heading.includes("未处理"))?.[1];
  const excludedOlderSection = [...sectionByHeading.entries()].find(([heading]) => heading.includes("时间窗外"))?.[1];

  const payload = {
    ok: true,
    fetchedAt: text.match(/生成时间[:：]\s*([^\n]+)/)?.[1]?.trim() || new Date().toISOString(),
    homeUrl: "https://www.theinformation.com/",
    pageTitle: text.match(/主页标题[:：]\s*([^\n]+)/)?.[1]?.trim() || "The Information",
    homeIssues: parseIssueText(text.match(/主页提醒[:：]\s*([^\n]+)/)?.[1] || ""),
    reusedExistingTab: false,
    maxCandidates: null,
    allowDirectGotoFallback: true,
    conservativeEarlyStopEnabled: false,
    earlyStopMinCompletedArticles: 10,
    earlyStopOlderArticleStreak: 4,
    conservativeMode: true,
    coverageWindow: overview.coverageWindow,
    candidateCount: overview.candidateCount,
    consideredArticleCount: overview.completedArticleCount + overview.unprocessedArticleCount,
    completedArticleCount: overview.completedArticleCount,
    blockedArticleCount: overview.blockedArticleCount,
    blockedArticles: blockedSection ? parseCompactSection(blockedSection) : [],
    partialArticleCount: overview.partialArticleCount,
    partialArticles: partialSection ? parseCompactSection(partialSection) : [],
    unprocessedArticleCount: overview.unprocessedArticleCount,
    unprocessedArticles: unprocessedSection ? parseCompactSection(unprocessedSection) : [],
    stoppedEarly: overview.stoppedEarly,
    stopReason: null,
    excludedOlderArticleCount: overview.excludedOlderArticleCount,
    excludedOlderArticles: excludedOlderSection ? parseCompactSection(excludedOlderSection) : [],
    articleCount: articleCards.length,
    articles: articleCards.map(parseStoryCard)
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, outputPath, articleCount: payload.articleCount }, null, 2));
}

main();
