import puppeteer from "puppeteer-core";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HOME_URL = process.env.THE_INFORMATION_HOME_URL || "https://www.theinformation.com/";
const MAX_CANDIDATES = Number(process.env.THE_INFORMATION_MAX_CANDIDATES || "0");
const DEBUG_URL = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:29825";
const DEFAULT_OUTPUT_PATH = path.resolve("output", "theinformation-latest.json");
const REPORT_TIMEZONE = process.env.THE_INFORMATION_TIMEZONE || "Asia/Shanghai";
const LOOKBACK_DAYS = Number(process.env.THE_INFORMATION_LOOKBACK_DAYS || "1");
const ARTICLE_NAV_RETRIES = Number(process.env.THE_INFORMATION_ARTICLE_NAV_RETRIES || "1");
const ARTICLE_CLICK_WAIT_TIMEOUT_MS = Number(process.env.THE_INFORMATION_ARTICLE_CLICK_WAIT_TIMEOUT_MS || "8000");
const ARTICLE_LOAD_DELAY_MS = Number(process.env.THE_INFORMATION_ARTICLE_LOAD_DELAY_MS || "4000");
const ARTICLE_RETRY_DELAY_MS = Number(process.env.THE_INFORMATION_ARTICLE_RETRY_DELAY_MS || "6000");
const PRE_CLICK_DELAY_MIN_MS = Number(process.env.THE_INFORMATION_PRE_CLICK_DELAY_MIN_MS || "1500");
const PRE_CLICK_DELAY_MAX_MS = Number(process.env.THE_INFORMATION_PRE_CLICK_DELAY_MAX_MS || "4500");
const POST_OPEN_DELAY_MIN_MS = Number(process.env.THE_INFORMATION_POST_OPEN_DELAY_MIN_MS || "4500");
const POST_OPEN_DELAY_MAX_MS = Number(process.env.THE_INFORMATION_POST_OPEN_DELAY_MAX_MS || "9000");
const POST_RETURN_DELAY_MIN_MS = Number(process.env.THE_INFORMATION_POST_RETURN_DELAY_MIN_MS || "2000");
const POST_RETURN_DELAY_MAX_MS = Number(process.env.THE_INFORMATION_POST_RETURN_DELAY_MAX_MS || "5000");
const MICRO_PAUSE_MIN_MS = Number(process.env.THE_INFORMATION_MICRO_PAUSE_MIN_MS || "250");
const MICRO_PAUSE_MAX_MS = Number(process.env.THE_INFORMATION_MICRO_PAUSE_MAX_MS || "900");
const LIGHT_SCROLL_STEPS = Number(process.env.THE_INFORMATION_LIGHT_SCROLL_STEPS || "2");
const MAX_CONSECUTIVE_BLOCKED = Number(process.env.THE_INFORMATION_MAX_CONSECUTIVE_BLOCKED || "2");
const ALLOW_DIRECT_GOTO_FALLBACK = process.env.THE_INFORMATION_ALLOW_DIRECT_GOTO_FALLBACK !== "false";

const SUSPENDED_MARKER = "Your account has been suspended";
const CLOUDFLARE_MARKERS = ["Just a moment...", "Please wait...", "执行安全验证", "请稍候"];
const PAYWALL_MARKERS = ["Subscribe to unlock", "Subscribe now", "Save 25%", "Already a subscriber? Sign in"];

function getOutputPath() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0 && args[outputIndex + 1]) {
    return path.resolve(args[outputIndex + 1]);
  }
  return process.env.THE_INFORMATION_OUTPUT_PATH || DEFAULT_OUTPUT_PATH;
}

function normalizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function getPathSegments(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function getArticleSlug(url) {
  const segments = getPathSegments(url);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

function canonicalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function cleanText(text) {
  return (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectPageIssues(title, bodyText) {
  const normalizedTitle = (title || "").toLowerCase();
  const normalizedBodyText = (bodyText || "").toLowerCase();
  const effectiveCloudflareMarkers = [
    ...CLOUDFLARE_MARKERS,
    "Verify you are human",
    "Checking if the site connection is secure",
    "Enable JavaScript and cookies to continue",
    "cloudflare"
  ];
  const issues = [];
  if (bodyText.includes(SUSPENDED_MARKER)) issues.push("account_suspended");
  if (
    effectiveCloudflareMarkers.some((marker) => {
      const normalizedMarker = marker.toLowerCase();
      return normalizedTitle.includes(normalizedMarker) || normalizedBodyText.includes(normalizedMarker);
    })
  ) {
    issues.push("cloudflare_challenge");
  }
  if (PAYWALL_MARKERS.some((marker) => bodyText.includes(marker))) {
    issues.push("paywalled_or_teaser");
  }
  return issues;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  const safeMin = Math.max(0, Math.min(min, max));
  const safeMax = Math.max(0, Math.max(min, max));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

async function delayBetween(min, max) {
  await delay(randomBetween(min, max));
}

async function maybeLightScroll(page, steps = LIGHT_SCROLL_STEPS) {
  const safeSteps = Math.max(0, steps);
  for (let index = 0; index < safeSteps; index += 1) {
    const direction = Math.random() < 0.75 ? 1 : -1;
    const offset = randomBetween(140, 420) * direction;
    await page
      .evaluate((value) => {
        window.scrollBy({ top: value, left: 0, behavior: "auto" });
      }, offset)
      .catch(() => null);
    await delayBetween(MICRO_PAUSE_MIN_MS, MICRO_PAUSE_MAX_MS);
  }
}

async function safeGoHome(page, homeUrl) {
  const currentUrl = page.url();
  const isHome =
    currentUrl.includes("theinformation.com") &&
    (() => {
      try {
        return new URL(currentUrl).pathname === "/";
      } catch {
        return false;
      }
    })();

  if (!isHome) {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await delayBetween(POST_RETURN_DELAY_MIN_MS, POST_RETURN_DELAY_MAX_MS);
  }
}

function buildUnprocessedArticle(item, reason) {
  return {
    canonicalUrl: item.canonicalUrl,
    clickUrl: item.clickUrl,
    linkText: item.text,
    reason
  };
}

function sortArticlesByPublishedAtDesc(articles) {
  return [...articles].sort((left, right) => {
    const leftValue = left.publishedAtIso ? Date.parse(left.publishedAtIso) : Number.NaN;
    const rightValue = right.publishedAtIso ? Date.parse(right.publishedAtIso) : Number.NaN;

    if (Number.isNaN(leftValue) && Number.isNaN(rightValue)) return 0;
    if (Number.isNaN(leftValue)) return 1;
    if (Number.isNaN(rightValue)) return -1;
    return rightValue - leftValue;
  });
}

function formatDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getCoverageWindow(timeZone, lookbackDays) {
  const now = new Date();
  const todayDateKey = formatDateKey(now, timeZone);
  return {
    timeZone,
    lookbackDays,
    generatedAtIso: now.toISOString(),
    todayDateKey,
    cutoffDateKey: shiftDateKey(todayDateKey, -lookbackDays)
  };
}

function formatInTimeZone(isoString, timeZone) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(date);
}

function hasNumericSignal(text) {
  return /(\$|%|\b\d[\d.,]*\b|\bbillion\b|\bmillion\b|\btrillion\b|\bcents\b|\byears?\b|\bmonths?\b|\bweeks?\b|\bdays?\b)/i.test(text);
}

function extractTakeaways(articleText) {
  const lines = cleanText(articleText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const startIndex = lines.findIndex((line) => /^The Takeaway$/i.test(line));

  if (startIndex === -1) return [];

  const items = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^Powered by/i.test(line)) break;
    if (/^(By|Share|Comments by)\b/i.test(line)) continue;
    if (line.length < 5) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    items.push(line.replace(/^[•\-]\s*/, ""));
    if (items.length >= 6) break;
  }

  return [...new Set(items)];
}

function extractKeyDataPoints(articleText) {
  const normalized = cleanText(articleText)
    .replace(/\n+/g, " ")
    .replace(/([.!?])([A-Z0-9“"'])/g, "$1 $2");
  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/);

  const items = [];
  for (const sentence of sentences) {
    const value = sentence.trim();
    if (!value) continue;
    if (!hasNumericSignal(value)) continue;
    items.push(value);
    if (items.length >= 6) break;
  }

  return [...new Set(items)];
}

function flattenJsonLd(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);

  const results = [value];
  if (Array.isArray(value["@graph"])) {
    results.push(...value["@graph"].flatMap(flattenJsonLd));
  }
  return results;
}

function parseJsonLdObjects(document) {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const objects = [];

  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;

    try {
      objects.push(...flattenJsonLd(JSON.parse(raw)));
    } catch {
    }
  }

  return objects;
}

function getAuthorNames(authorValue) {
  if (!authorValue) return [];
  if (Array.isArray(authorValue)) return authorValue.flatMap(getAuthorNames);
  if (typeof authorValue === "string") return [authorValue];
  if (typeof authorValue === "object" && authorValue.name) return [authorValue.name];
  return [];
}

function extractArticleMetadata(html, pageUrl, articleText) {
  const dom = new JSDOM(html, { url: pageUrl });
  const jsonLdObjects = parseJsonLdObjects(dom.window.document);
  const newsArticle = jsonLdObjects.find((item) => {
    const type = item?.["@type"];
    return Array.isArray(type) ? type.includes("NewsArticle") : type === "NewsArticle";
  });

  const section = newsArticle?.articleSection
    ? Array.isArray(newsArticle.articleSection)
      ? newsArticle.articleSection[0]
      : newsArticle.articleSection
    : null;
  const authors = [...new Set(getAuthorNames(newsArticle?.author))];
  const publishedAtIso = newsArticle?.datePublished || null;
  const modifiedAtIso = newsArticle?.dateModified || null;

  return {
    section,
    authors,
    publishedAtIso,
    publishedAtLocal: publishedAtIso ? formatInTimeZone(publishedAtIso, REPORT_TIMEZONE) : null,
    publishedDateKey: publishedAtIso ? formatDateKey(new Date(publishedAtIso), REPORT_TIMEZONE) : null,
    modifiedAtIso,
    takeaways: extractTakeaways(articleText),
    keyDataPoints: extractKeyDataPoints(articleText)
  };
}

function scoreLink(text, href) {
  const haystack = `${text} ${href}`.toLowerCase();
  let score = 0;
  if (haystack.includes("/articles/")) score += 4;
  if (haystack.includes("briefing")) score += 2;
  if (haystack.includes("analysis")) score += 1;
  if (haystack.includes("save 25%")) score -= 10;
  if (haystack.includes("subscribe")) score -= 10;
  if (haystack.includes("sign in")) score -= 10;
  if (haystack.includes("#comments-section")) score -= 10;
  if (text.trim().length <= 2) score -= 5;
  return score;
}

async function readPageState(page) {
  const title = await page.title();
  const currentUrl = page.url();
  const bodyText = cleanText(await page.evaluate(() => document.body?.innerText?.trim() || ""));
  const issues = detectPageIssues(title, bodyText);
  if (currentUrl.includes("/cdn-cgi/challenge-platform") && !issues.includes("cloudflare_challenge")) {
    issues.push("cloudflare_challenge");
  }
  return {
    title,
    bodyText,
    issues
  };
}

async function getHomePage(browser) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false).catch(() => null);
  await page.setBypassServiceWorker(true).catch(() => null);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector("body", { timeout: 15000 });
  await delay(5000);
  return { page, reused: false };
}

async function extractCandidateLinks(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => ({
        href: anchor.href,
        text: (anchor.innerText || anchor.textContent || "").trim()
      }))
      .filter((item) => item.href && item.text)
  );
}

function pickArticleLinks(candidates) {
  const seen = new Set();
  const ranked = candidates
    .map((item) => {
      const clickUrl = normalizeUrl(item.href);
      const canonicalUrl = canonicalizeUrl(item.href);
      if (!clickUrl || !canonicalUrl) return null;
      if (!clickUrl.includes("theinformation.com")) return null;
      if (!clickUrl.includes("/articles/")) return null;
      if (seen.has(canonicalUrl)) return null;
      seen.add(canonicalUrl);
      return {
        clickUrl,
        canonicalUrl,
        text: item.text.replace(/\s+/g, " ").trim(),
        score: scoreLink(item.text, clickUrl)
      };
    })
    .filter((item) => item && item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (MAX_CANDIDATES > 0) {
    return ranked.slice(0, MAX_CANDIDATES);
  }

  return ranked;
}

function extractReadableContent(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) return null;

  return {
    title: article.title,
    excerpt: article.excerpt,
    textContent: cleanText(article.textContent || "")
  };
}

function extractResolvedCanonicalUrl(html, fallbackUrl) {
  try {
    const dom = new JSDOM(html, { url: fallbackUrl });
    const link = dom.window.document.querySelector('link[rel="canonical"]');
    const href = link?.getAttribute("href");
    return canonicalizeUrl(href || fallbackUrl);
  } catch {
    return canonicalizeUrl(fallbackUrl);
  }
}

function isClearlyHomepageLike(text, title, currentUrl) {
  const normalizedText = cleanText(text).toLowerCase();
  const normalizedTitle = cleanText(title).toLowerCase();
  const normalizedUrl = canonicalizeUrl(currentUrl) || "";

  if (normalizedTitle === "the information") return true;
  if (normalizedUrl === canonicalizeUrl(HOME_URL)) return true;
  if (normalizedText.startsWith("five times/weekthe briefing")) return true;
  if (normalizedText.includes("search our community directory")) return true;
  if (normalizedText.includes("view all newsletters")) return true;
  return false;
}

function isLikelyValidArticleCapture(result, expectedCanonicalUrl) {
  const expectedPath = new URL(expectedCanonicalUrl).pathname;
  const actualPath = new URL(result.canonicalUrl || result.url || HOME_URL).pathname;
  const expectedSlug = getArticleSlug(expectedCanonicalUrl);
  const actualSlug = getArticleSlug(result.canonicalUrl || result.url || HOME_URL);
  const text = cleanText(result.text);
  const title = cleanText(result.title);

  const samePath = actualPath === expectedPath;
  const sameSlug = expectedSlug && actualSlug && expectedSlug === actualSlug;

  if (!samePath && !sameSlug) return false;
  if (!title || title === "The Information") return false;
  if (!result.publishedDateKey) return false;
  if (!text || text.length < 280) return false;
  if (isClearlyHomepageLike(text, title, result.url)) return false;
  return true;
}

function chooseBetterArticleRecord(existing, incoming) {
  if (!existing) return incoming;
  const existingScore =
    (existing.publishedDateKey ? 4 : 0) +
    (existing.section ? 2 : 0) +
    Math.min(cleanText(existing.text).length, 5000) / 1000;
  const incomingScore =
    (incoming.publishedDateKey ? 4 : 0) +
    (incoming.section ? 2 : 0) +
    Math.min(cleanText(incoming.text).length, 5000) / 1000;
  return incomingScore > existingScore ? incoming : existing;
}

function dedupeArticlesByCanonical(articles) {
  const byCanonical = new Map();

  for (const article of articles) {
    const key = article.canonicalUrl || article.url;
    if (!key) continue;
    byCanonical.set(key, chooseBetterArticleRecord(byCanonical.get(key), article));
  }

  return [...byCanonical.values()];
}

async function findMatchingAnchorHandle(page, item) {
  const anchors = await page.$$("a[href]");

  for (const anchor of anchors) {
    const info = await anchor
      .evaluate((element) => ({
        href: element.href,
        text: (element.innerText || element.textContent || "").trim()
      }))
      .catch(() => null);

    if (!info?.href || !info.text) {
      await anchor.dispose().catch(() => null);
      continue;
    }

    if (info.href === item.clickUrl) {
      return anchor;
    }

    try {
      const parsed = new URL(info.href);
      parsed.search = "";
      parsed.hash = "";
      if (parsed.toString() === item.canonicalUrl) {
        return anchor;
      }
    } catch {
    }

    await anchor.dispose().catch(() => null);
  }

  return null;
}

async function fetchArticleFromHome(page, item) {
  const homeUrl = HOME_URL;
  const restoreHome = async () => {
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await delayBetween(POST_RETURN_DELAY_MIN_MS, POST_RETURN_DELAY_MAX_MS);
    await safeGoHome(page, homeUrl);
    await maybeLightScroll(page, 1);
  };

  for (let attempt = 1; attempt <= ARTICLE_NAV_RETRIES + 1; attempt += 1) {
    await safeGoHome(page, homeUrl);
    await maybeLightScroll(page);
    await delayBetween(PRE_CLICK_DELAY_MIN_MS, PRE_CLICK_DELAY_MAX_MS);

    const anchorHandle = await findMatchingAnchorHandle(page, item);

    if (!anchorHandle && !ALLOW_DIRECT_GOTO_FALLBACK) {
      throw new Error(`Link no longer visible on homepage: ${item.canonicalUrl}`);
    }

    let navigationMode = anchorHandle ? "homepage_click" : "direct_goto_fallback";
    if (anchorHandle) {
      await anchorHandle.evaluate((element) => element.scrollIntoView({ block: "center" })).catch(() => null);
      await Promise.allSettled([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: ARTICLE_CLICK_WAIT_TIMEOUT_MS }),
        anchorHandle.click({ delay: randomBetween(40, 120) })
      ]);
      await anchorHandle.dispose().catch(() => null);
    } else {
      await page.goto(item.canonicalUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    }

    await delay(ARTICLE_LOAD_DELAY_MS);
    await maybeLightScroll(page);
    await delayBetween(POST_OPEN_DELAY_MIN_MS, POST_OPEN_DELAY_MAX_MS);

    const { title, bodyText, issues } = await readPageState(page);
    const articleText = cleanText(
      await page.evaluate(() => document.querySelector("article")?.innerText?.trim() || document.body?.innerText?.trim() || "")
    );
    const html = await page.content();
    const readable = extractReadableContent(html, page.url());
    const metadata = extractArticleMetadata(html, page.url(), articleText || readable?.textContent || bodyText);

    let resolvedCanonicalUrl = extractResolvedCanonicalUrl(html, page.url());
    let result = {
      url: page.url(),
      canonicalUrl: resolvedCanonicalUrl || item.canonicalUrl,
      linkText: item.text,
      title: readable?.title || title,
      excerpt: readable?.excerpt || "",
      issues,
      fetchAttempt: attempt,
      navigationMode,
      section: metadata.section,
      authors: metadata.authors,
      publishedAtIso: metadata.publishedAtIso,
      publishedAtLocal: metadata.publishedAtLocal,
      publishedDateKey: metadata.publishedDateKey,
      modifiedAtIso: metadata.modifiedAtIso,
      takeaways: metadata.takeaways,
      keyDataPoints: metadata.keyDataPoints,
      text: cleanText(readable?.textContent || articleText || bodyText).slice(0, 20000)
    };

    if (anchorHandle && !isLikelyValidArticleCapture(result, item.canonicalUrl)) {
      navigationMode = "direct_goto_retry";
      await page.goto(item.canonicalUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
      await delay(ARTICLE_LOAD_DELAY_MS);
      await maybeLightScroll(page);
      await delayBetween(POST_OPEN_DELAY_MIN_MS, POST_OPEN_DELAY_MAX_MS);

      const retryState = await readPageState(page);
      const retryArticleText = cleanText(
        await page.evaluate(() => document.querySelector("article")?.innerText?.trim() || document.body?.innerText?.trim() || "")
      );
      const retryHtml = await page.content();
      const retryReadable = extractReadableContent(retryHtml, page.url());
      const retryMetadata = extractArticleMetadata(
        retryHtml,
        page.url(),
        retryArticleText || retryReadable?.textContent || retryState.bodyText
      );
      resolvedCanonicalUrl = extractResolvedCanonicalUrl(retryHtml, page.url());
      result = {
        url: page.url(),
        canonicalUrl: resolvedCanonicalUrl || item.canonicalUrl,
        linkText: item.text,
        title: retryReadable?.title || retryState.title,
        excerpt: retryReadable?.excerpt || "",
        issues: retryState.issues,
        fetchAttempt: attempt,
        navigationMode,
        section: retryMetadata.section,
        authors: retryMetadata.authors,
        publishedAtIso: retryMetadata.publishedAtIso,
        publishedAtLocal: retryMetadata.publishedAtLocal,
        publishedDateKey: retryMetadata.publishedDateKey,
        modifiedAtIso: retryMetadata.modifiedAtIso,
        takeaways: retryMetadata.takeaways,
        keyDataPoints: retryMetadata.keyDataPoints,
        text: cleanText(retryReadable?.textContent || retryArticleText || retryState.bodyText).slice(0, 20000)
      };
    }

    const isValidCapture = isLikelyValidArticleCapture(result, item.canonicalUrl);
    const hasCloudflareIssue = result.issues.includes("cloudflare_challenge");

    await restoreHome();

    if (!isValidCapture) {
      if (attempt <= ARTICLE_NAV_RETRIES) {
        await delay(ARTICLE_RETRY_DELAY_MS * attempt);
        continue;
      }

      if (hasCloudflareIssue) {
        return {
          ...result,
          canonicalUrl: result.canonicalUrl || item.canonicalUrl,
          title: result.title || item.text,
          linkText: item.text,
          text: ""
        };
      }

      throw new Error(`page_mismatch:${item.canonicalUrl}`);
    }

    if (!hasCloudflareIssue || attempt > ARTICLE_NAV_RETRIES) {
      return result;
    }

    await delay(ARTICLE_RETRY_DELAY_MS * attempt);
  }

  throw new Error(`Failed to fetch article after retries: ${item.canonicalUrl}`);
}

function shouldIncludeArticle(article, coverageWindow) {
  if (!article.publishedDateKey) return true;
  return article.publishedDateKey >= coverageWindow.cutoffDateKey;
}

export {
  cleanText,
  getArticleSlug,
  isClearlyHomepageLike,
  isLikelyValidArticleCapture
};

async function main() {
  const outputPath = getOutputPath();
  const coverageWindow = getCoverageWindow(REPORT_TIMEZONE, LOOKBACK_DAYS);
  const browser = await puppeteer.connect({ browserURL: DEBUG_URL, defaultViewport: null });
  const { page, reused } = await getHomePage(browser);

  try {
    const { title: pageTitle, issues: homeIssues } = await readPageState(page);
    const candidates = await extractCandidateLinks(page);
    const articles = pickArticleLinks(candidates);

    const failurePayload = {
      ok: false,
      fetchedAt: new Date().toISOString(),
      homeUrl: HOME_URL,
      pageTitle,
      homeIssues,
      reusedExistingTab: reused,
      coverageWindow
    };

    if (homeIssues.includes("cloudflare_challenge")) {
      const payload = {
        ...failurePayload,
        message: "The Information is showing a Cloudflare verification page."
      };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
      console.log(JSON.stringify(payload, null, 2));
      process.exit(1);
    }

    if (articles.length === 0) {
      const payload = {
        ...failurePayload,
        message: "No candidate article links found. You may need to log in first or adjust the homepage."
      };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
      console.log(JSON.stringify(payload, null, 2));
      process.exit(1);
    }

    const fetchedArticles = [];
    const unprocessedArticles = [];
    let consecutiveBlockedArticles = 0;
    let stopReason = null;

    for (let index = 0; index < articles.length; index += 1) {
      const item = articles[index];

      try {
        const article = await fetchArticleFromHome(page, item);
        fetchedArticles.push(article);

        if (article.issues.includes("cloudflare_challenge")) {
          consecutiveBlockedArticles += 1;
        } else {
          consecutiveBlockedArticles = 0;
        }

        if (consecutiveBlockedArticles >= MAX_CONSECUTIVE_BLOCKED) {
          stopReason = `stopped_after_${consecutiveBlockedArticles}_consecutive_blocked_articles`;
          unprocessedArticles.push(
            ...articles.slice(index + 1).map((remainingItem) => buildUnprocessedArticle(remainingItem, stopReason))
          );
          break;
        }
      } catch (error) {
        consecutiveBlockedArticles = 0;
        const message = error instanceof Error ? error.message : String(error);
        unprocessedArticles.push(buildUnprocessedArticle(item, `fetch_error:${message}`));
        await safeGoHome(page, HOME_URL);
      }
    }

    const dedupedFetchedArticles = dedupeArticlesByCanonical(fetchedArticles);
    const blockedArticles = sortArticlesByPublishedAtDesc(
      dedupedFetchedArticles
      .filter((article) => article.issues.includes("cloudflare_challenge"))
      .map((article) => ({
        title: article.title,
        canonicalUrl: article.canonicalUrl,
        issues: article.issues,
        fetchAttempt: article.fetchAttempt,
        navigationMode: article.navigationMode,
        publishedAtIso: article.publishedAtIso,
        publishedAtLocal: article.publishedAtLocal,
        publishedDateKey: article.publishedDateKey
      }))
    );
    const nonBlockedArticles = dedupedFetchedArticles.filter((article) => !article.issues.includes("cloudflare_challenge"));
    const coverageMatchedArticles = nonBlockedArticles.filter((article) => shouldIncludeArticle(article, coverageWindow));
    const partialArticles = sortArticlesByPublishedAtDesc(
      coverageMatchedArticles
        .filter((article) => article.issues.includes("paywalled_or_teaser"))
        .map((article) => ({
          title: article.title,
          canonicalUrl: article.canonicalUrl,
          issues: article.issues,
          fetchAttempt: article.fetchAttempt,
          navigationMode: article.navigationMode,
          publishedAtIso: article.publishedAtIso,
          publishedAtLocal: article.publishedAtLocal,
          publishedDateKey: article.publishedDateKey
        }))
    );
    const includedArticles = sortArticlesByPublishedAtDesc(
      coverageMatchedArticles.filter((article) => !article.issues.includes("paywalled_or_teaser"))
    );
    const excludedOlderArticles = sortArticlesByPublishedAtDesc(
      nonBlockedArticles.filter((article) => !shouldIncludeArticle(article, coverageWindow))
      .map((article) => ({
        title: article.title,
        canonicalUrl: article.canonicalUrl,
        publishedAtIso: article.publishedAtIso,
        publishedAtLocal: article.publishedAtLocal,
        publishedDateKey: article.publishedDateKey
      }))
    );

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      homeUrl: HOME_URL,
      pageTitle,
      homeIssues,
      reusedExistingTab: reused,
      maxCandidates: MAX_CANDIDATES > 0 ? MAX_CANDIDATES : null,
      allowDirectGotoFallback: ALLOW_DIRECT_GOTO_FALLBACK,
      conservativeMode: true,
      coverageWindow,
      candidateCount: articles.length,
      consideredArticleCount: fetchedArticles.length + unprocessedArticles.length,
      completedArticleCount: fetchedArticles.length,
      blockedArticleCount: blockedArticles.length,
      blockedArticles,
      partialArticleCount: partialArticles.length,
      partialArticles,
      unprocessedArticleCount: unprocessedArticles.length,
      unprocessedArticles,
      stoppedEarly: Boolean(stopReason),
      stopReason,
      excludedOlderArticleCount: excludedOlderArticles.length,
      excludedOlderArticles,
      articleCount: includedArticles.length,
      articles: includedArticles
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    if (!reused) {
      await page.close().catch(() => null);
    }
    await browser.disconnect();
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
    process.exit(1);
  });
}
