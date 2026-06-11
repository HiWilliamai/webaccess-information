import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) return path.resolve(args[index + 1]);
  return null;
}

function normalizeUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    const url = new URL(rawValue);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return rawValue.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

function sourceItemsFromLatest(latest) {
  return [
    ...(latest.articles || []),
    ...(latest.partialArticles || []),
    ...(latest.blockedArticles || []),
    ...(latest.unprocessedArticles || [])
  ]
    .map((article) => ({
      title: article.title || article.linkText,
      url: article.canonicalUrl || article.url || article.clickUrl
    }))
    .filter((item) => item.title && item.url);
}

function normalizeArticleGroup(group, sourceByUrl) {
  if (!Array.isArray(group)) return group;

  return group.map((article) => {
    const source = sourceByUrl.get(normalizeUrl(article?.original_link));
    if (!source) return article;

    return {
      ...article,
      title: source.title,
      original_link: source.url
    };
  });
}

function normalizeBriefSourceFields({ latest, brief }) {
  const sourceByUrl = new Map();
  for (const item of sourceItemsFromLatest(latest)) {
    sourceByUrl.set(normalizeUrl(item.url), item);
  }

  return {
    ...brief,
    featured_articles: normalizeArticleGroup(brief.featured_articles, sourceByUrl),
    other_articles: normalizeArticleGroup(brief.other_articles, sourceByUrl),
    partial_articles: normalizeArticleGroup(brief.partial_articles, sourceByUrl),
    blocked_articles: normalizeArticleGroup(brief.blocked_articles, sourceByUrl),
    unprocessed_articles: normalizeArticleGroup(brief.unprocessed_articles, sourceByUrl)
  };
}

function main() {
  const latestPath = getArgValue("--latest");
  const briefPath = getArgValue("--brief");
  const outputPath = getArgValue("--output") || briefPath;
  if (!latestPath || !briefPath || !outputPath) {
    throw new Error("Missing required args: --latest, --brief, --output");
  }

  const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
  const normalized = normalizeBriefSourceFields({ latest, brief });
  fs.writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, outputPath }, null, 2));
}

const isDirectExecution =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) main();

export { normalizeBriefSourceFields };
