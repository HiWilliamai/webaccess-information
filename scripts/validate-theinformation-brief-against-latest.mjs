import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) return path.resolve(args[index + 1]);
  return null;
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032\u00B4`']/g, "")
    .replace(/([\p{L}\p{N}])\?([\p{L}\p{N}])/gu, "$1$2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
    ...(latest.articles || []).map((article) => ({
      title: article.title,
      url: article.canonicalUrl || article.url || article.clickUrl
    })),
    ...(latest.partialArticles || []).map((article) => ({
      title: article.title,
      url: article.canonicalUrl || article.url || article.clickUrl
    })),
    ...(latest.blockedArticles || []).map((article) => ({
      title: article.title,
      url: article.canonicalUrl || article.url || article.clickUrl
    })),
    ...(latest.unprocessedArticles || []).map((article) => ({
      title: article.title || article.linkText,
      url: article.canonicalUrl || article.url || article.clickUrl
    }))
  ].filter((item) => item.title || item.url);
}

function outputItemsFromBrief(brief) {
  return [
    ...(brief.featured_articles || []).map((article) => ({
      title: article.title,
      url: article.original_link
    })),
    ...(brief.other_articles || []).map((article) => ({
      title: article.title,
      url: article.original_link
    })),
    ...(brief.partial_articles || []).map((article) => ({
      title: article.title,
      url: article.original_link
    })),
    ...(brief.blocked_articles || []).map((article) => ({
      title: article.title,
      url: article.original_link
    })),
    ...(brief.unprocessed_articles || []).map((article) => ({
      title: article.title,
      url: article.original_link
    }))
  ].filter((item) => item.title || item.url);
}

function itemMatches(item, urlSet, titleSet) {
  const normalizedUrl = normalizeUrl(item.url);
  if (normalizedUrl && urlSet.has(normalizedUrl)) return true;

  const normalizedTitle = normalizeTitle(item.title);
  return Boolean(normalizedTitle && titleSet.has(normalizedTitle));
}

function itemLabel(item) {
  return item.title || item.url;
}

function findMissingTitles(expectedItems, actualItems) {
  const actualUrls = new Set(actualItems.map((item) => normalizeUrl(item.url)).filter(Boolean));
  const actualTitles = new Set(actualItems.map((item) => normalizeTitle(item.title)).filter(Boolean));
  return expectedItems
    .filter((item) => !itemMatches(item, actualUrls, actualTitles))
    .map(itemLabel);
}

function findUnknownTitles(expectedItems, actualItems) {
  const expectedUrls = new Set(expectedItems.map((item) => normalizeUrl(item.url)).filter(Boolean));
  const expectedTitles = new Set(expectedItems.map((item) => normalizeTitle(item.title)).filter(Boolean));
  return actualItems
    .filter((item) => !itemMatches(item, expectedUrls, expectedTitles))
    .map(itemLabel);
}

function validateBriefAgainstLatest(latest, brief) {
  const expectedItems = sourceItemsFromLatest(latest);
  const actualItems = outputItemsFromBrief(brief);
  const missingTitles = findMissingTitles(expectedItems, actualItems);
  const unknownTitles = findUnknownTitles(expectedItems, actualItems);

  return {
    ok: missingTitles.length === 0 && unknownTitles.length === 0,
    expectedCount: expectedItems.length,
    actualCount: actualItems.length,
    missingTitles,
    unknownTitles
  };
}

function main() {
  const latestPath = getArgValue("--latest");
  const briefPath = getArgValue("--brief");
  if (!latestPath || !briefPath) {
    throw new Error("Missing required args: --latest, --brief");
  }

  const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
  const result = validateBriefAgainstLatest(latest, brief);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

const isDirectExecution =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) main();

export { validateBriefAgainstLatest };
