import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  clearBlockingOverlayWithRefresh,
  extractArticleMetadata,
  isLikelyBlockingOverlayText,
  isLikelyValidArticleCapture,
  pickArticleLinks,
  shouldRefreshAfterHomepageClick,
  isRetryableCloudflareWaitTimeout,
  waitForHomeReadiness,
  waitForIssueToClear,
  writeFetchPayload,
  shouldStopAfterOlderArticleStreak
} from "../scripts/fetch-theinformation.mjs";

test("keeps article-like newsletter and briefing links as candidates", () => {
  const links = pickArticleLinks([
    {
      href: "https://www.theinformation.com/newsletters/the-briefing/microsoft-comes-openai-deal-winner-risks-ai-financing",
      text: "Microsoft Comes Out of OpenAI Deal a Winner; Risks in AI Financing"
    },
    {
      href: "https://www.theinformation.com/briefings/600-google-employees-ask-sundar-pichai-reject-pentagon-classified-ai-deal",
      text: "600 Google Employees Ask Sundar Pichai to Reject Pentagon Classified AI Deal"
    },
    {
      href: "https://www.theinformation.com/articles/openais-aws-push-comes-customers-embrace-rivals",
      text: "OpenAI's AWS Push Comes As Customers Embrace Rivals"
    }
  ]);

  assert.deepEqual(
    links.map((item) => new URL(item.canonicalUrl).pathname),
    [
      "/newsletters/the-briefing/microsoft-comes-openai-deal-winner-risks-ai-financing",
      "/briefings/600-google-employees-ask-sundar-pichai-reject-pentagon-classified-ai-deal",
      "/articles/openais-aws-push-comes-customers-embrace-rivals"
    ]
  );
});

test("accepts newsletter redirect when slug, body, and metadata are valid", () => {
  const result = {
    canonicalUrl: "https://www.theinformation.com/newsletters/the-briefing/openais-tbpn-deal-joke",
    url: "https://www.theinformation.com/newsletters/the-briefing/openais-tbpn-deal-joke?rc=jn0pp4",
    title: "Why OpenAI's TBPN Deal is No Joke — The Information",
    publishedDateKey: "2026-04-03",
    text: "The Briefing Why OpenAI's TBPN Deal is No Joke By Martin Peers Share This is a long enough article body to be treated as valid article capture rather than a homepage shell. It contains several concrete paragraphs and should not be rejected simply because the site redirects this story into the newsletter namespace."
  };

  assert.equal(
    isLikelyValidArticleCapture(result, "https://www.theinformation.com/articles/openais-tbpn-deal-joke"),
    true
  );
});

test("rejects homepage-like captures even if a slug is present", () => {
  const result = {
    canonicalUrl: "https://www.theinformation.com/articles/openais-tbpn-deal-joke",
    url: "https://www.theinformation.com/?rc=jn0pp4",
    title: "The Information",
    publishedDateKey: null,
    text: "Five times/weekThe BriefingGet smarter about the most important stories in tech, media and finance by following Silicon Valley's most-read executive newsletter. View all newsletters. Search our community directory to engage with others."
  };

  assert.equal(
    isLikelyValidArticleCapture(result, "https://www.theinformation.com/articles/openais-tbpn-deal-joke"),
    false
  );
});

test("recognizes The Information upgrade overlays as blocking article clicks", () => {
  assert.equal(
    isLikelyBlockingOverlayText(
      "The Information Pro $58.25 / Month Upgrade AI-Powered Insights, Beyond the News Deep Research"
    ),
    true
  );
  assert.equal(isLikelyBlockingOverlayText("Latest Exclusive News Twilio's AI Boost Is a Double-Edged Sword"), false);
});

test("refreshes once when a blocking overlay remains after dismissal", async () => {
  let overlayVisible = true;
  let dismissCount = 0;
  let refreshCount = 0;

  const result = await clearBlockingOverlayWithRefresh({
    allowRefresh: true,
    dismissOverlay: async () => {
      dismissCount += 1;
      return false;
    },
    hasBlockingOverlay: async () => overlayVisible,
    refreshPage: async () => {
      refreshCount += 1;
      overlayVisible = false;
    }
  });

  assert.deepEqual(result, {
    dismissed: false,
    refreshed: true,
    stillBlocked: false
  });
  assert.equal(dismissCount, 2);
  assert.equal(refreshCount, 1);
});

test("does not refresh when the overlay is gone after dismissal", async () => {
  let dismissCount = 0;
  let refreshCount = 0;

  const result = await clearBlockingOverlayWithRefresh({
    allowRefresh: true,
    dismissOverlay: async () => {
      dismissCount += 1;
      return true;
    },
    hasBlockingOverlay: async () => false,
    refreshPage: async () => {
      refreshCount += 1;
    }
  });

  assert.deepEqual(result, {
    dismissed: true,
    refreshed: false,
    stillBlocked: false
  });
  assert.equal(dismissCount, 1);
  assert.equal(refreshCount, 0);
});

test("marks homepage-like click captures as refresh fallback candidates", () => {
  const result = {
    canonicalUrl: "https://www.theinformation.com/articles/openais-tbpn-deal-joke",
    url: "https://www.theinformation.com/?rc=jn0pp4",
    title: "The Information",
    publishedDateKey: null,
    issues: [],
    text: "The Information Latest Exclusive News Upgrade to Pro Community Directory"
  };

  assert.equal(
    shouldRefreshAfterHomepageClick(result, "https://www.theinformation.com/articles/openais-tbpn-deal-joke"),
    true
  );
  assert.equal(
    shouldRefreshAfterHomepageClick(
      { ...result, issues: ["cloudflare_challenge"] },
      "https://www.theinformation.com/articles/openais-tbpn-deal-joke"
    ),
    false
  );
});

test("waits for a Cloudflare issue to clear before continuing", async () => {
  const states = [
    { issues: ["cloudflare_challenge"], title: "Please wait" },
    { issues: ["cloudflare_challenge"], title: "Please wait" },
    { issues: [], title: "The Information" }
  ];
  const waits = [];

  const result = await waitForIssueToClear({
    readState: async () => states.shift(),
    isBlocked: (state) => state.issues.includes("cloudflare_challenge"),
    wait: async (ms) => waits.push(ms),
    timeoutMs: 15000,
    pollMs: 5000
  });

  assert.deepEqual(result, {
    cleared: true,
    timedOut: false,
    waitedMs: 10000,
    state: { issues: [], title: "The Information" }
  });
  assert.deepEqual(waits, [5000, 5000]);
});

test("waits through empty homepage states until article links are ready", async () => {
  const states = [
    { title: "", bodyText: "", issues: [] },
    { title: "The Information", bodyText: "Latest Exclusive News", issues: [] }
  ];
  const candidateLists = [
    [],
    [
      {
        href: "https://www.theinformation.com/articles/openais-revenue-chief-barnstorms-business-customers",
        text: "OpenAI’s Revenue Chief Barnstorms for Business Customers"
      }
    ]
  ];
  const waits = [];

  const result = await waitForHomeReadiness({
    readState: async () => states.shift(),
    readCandidates: async () => candidateLists.shift(),
    wait: async (ms) => waits.push(ms),
    timeoutMs: 15000,
    pollMs: 5000
  });

  assert.equal(result.ready, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.waitedMs, 5000);
  assert.deepEqual(waits, [5000]);
  assert.equal(pickArticleLinks(result.candidates).length, 1);
});

test("stops waiting for Cloudflare after the configured timeout", async () => {
  const waits = [];

  const result = await waitForIssueToClear({
    readState: async () => ({ issues: ["cloudflare_challenge"], title: "Please wait" }),
    isBlocked: (state) => state.issues.includes("cloudflare_challenge"),
    wait: async (ms) => waits.push(ms),
    timeoutMs: 12000,
    pollMs: 5000
  });

  assert.equal(result.cleared, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.waitedMs, 12000);
  assert.deepEqual(waits, [5000, 5000, 2000]);
});

test("marks a Cloudflare wait timeout as retryable for automation", () => {
  assert.equal(
    isRetryableCloudflareWaitTimeout({
      timedOut: true,
      state: { issues: ["cloudflare_challenge"] }
    }),
    true
  );
  assert.equal(
    isRetryableCloudflareWaitTimeout({
      cleared: true,
      timedOut: false,
      state: { issues: [] }
    }),
    false
  );
});

test("defaults the Cloudflare homepage wait window to four minutes", () => {
  const script = fs.readFileSync(path.resolve("scripts", "fetch-theinformation.mjs"), "utf8");

  assert.match(script, /THE_INFORMATION_CLOUDFLARE_CLEAR_TIMEOUT_MS \|\| "240000"/);
});

test("extracts publication time from visible article text when structured metadata is missing", () => {
  const metadata = extractArticleMetadata(
    '<html><head><title>OpenAI’s AWS Push Comes As Customers Embrace Rivals</title></head><body></body></html>',
    "https://www.theinformation.com/articles/openais-aws-push-comes-customers-embrace-rivals",
    "By Catherine Perloff Share Apr 27, 2026, 6:00am PDT Amazon has touted a deal to finally bring OpenAI to AWS."
  );

  assert.equal(metadata.publishedAtIso, "2026-04-27T13:00:00.000Z");
  assert.equal(metadata.publishedDateKey, "2026-04-27");
});

test("extracts publication time from NewsArticle JSON-LD", () => {
  const metadata = extractArticleMetadata(
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      articleSection: ["technology"],
      datePublished: "2026-04-27T13:00:42Z",
      author: [{ "@type": "Person", name: "Catherine Perloff" }]
    })}</script>`,
    "https://www.theinformation.com/articles/openais-aws-push-comes-customers-embrace-rivals",
    "Article body"
  );

  assert.equal(metadata.publishedAtIso, "2026-04-27T13:00:42.000Z");
  assert.equal(metadata.section, "technology");
  assert.deepEqual(metadata.authors, ["Catherine Perloff"]);
});

test("stops after four valid older articles once enough current coverage exists", () => {
  const coverageWindow = {
    cutoffDateKey: "2026-04-30"
  };
  const fetchedArticles = [
    ...Array.from({ length: 6 }, (_, index) => ({
      title: `Current article ${index + 1}`,
      publishedDateKey: "2026-05-01",
      issues: []
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      title: `Older article ${index + 1}`,
      publishedDateKey: "2026-04-29",
      issues: [],
      text: "Full article body"
    }))
  ];

  assert.equal(
    shouldStopAfterOlderArticleStreak(fetchedArticles, coverageWindow, {
      minCompletedArticles: 10,
      olderArticleStreak: 4
    }),
    true
  );
});

test("does not stop before the minimum completed article count", () => {
  const coverageWindow = {
    cutoffDateKey: "2026-04-30"
  };
  const fetchedArticles = [
    { title: "Current article", publishedDateKey: "2026-05-01", issues: [] },
    ...Array.from({ length: 4 }, (_, index) => ({
      title: `Older article ${index + 1}`,
      publishedDateKey: "2026-04-29",
      issues: [],
      text: "Full article body"
    }))
  ];

  assert.equal(
    shouldStopAfterOlderArticleStreak(fetchedArticles, coverageWindow, {
      minCompletedArticles: 10,
      olderArticleStreak: 4
    }),
    false
  );
});

test("does not count challenge, error, or missing-date articles toward older streak", () => {
  const coverageWindow = {
    cutoffDateKey: "2026-04-30"
  };
  const fetchedArticles = [
    ...Array.from({ length: 6 }, (_, index) => ({
      title: `Current article ${index + 1}`,
      publishedDateKey: "2026-05-01",
      issues: []
    })),
    { title: "Older 1", publishedDateKey: "2026-04-29", issues: [] },
    { title: "Challenge", publishedDateKey: "2026-04-29", issues: ["cloudflare_challenge"] },
    { title: "Error", publishedDateKey: "2026-04-29", issues: ["fetch_error"] },
    { title: "Missing date", publishedDateKey: null, issues: [] },
    { title: "Older 2", publishedDateKey: "2026-04-29", issues: [] },
    { title: "Older 3", publishedDateKey: "2026-04-29", issues: [] }
  ];

  assert.equal(
    shouldStopAfterOlderArticleStreak(fetchedArticles, coverageWindow, {
      minCompletedArticles: 10,
      olderArticleStreak: 4
    }),
    false
  );
});

test("failed fetch payloads do not overwrite the last successful output", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ti-fetch-"));
  const outputPath = path.join(tempDir, "theinformation-latest.json");
  const previousPayload = { ok: true, articleCount: 3 };
  const failurePayload = { ok: false, message: "The Information is showing a Cloudflare verification page." };

  fs.writeFileSync(outputPath, JSON.stringify(previousPayload, null, 2));

  const result = writeFetchPayload(outputPath, failurePayload);

  assert.equal(result.wrotePrimaryOutput, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), previousPayload);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${outputPath}.failed.json`, "utf8")), failurePayload);
});

test("successful fetch payloads clear stale failed output", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ti-fetch-"));
  const outputPath = path.join(tempDir, "theinformation-latest.json");
  const failedOutputPath = `${outputPath}.failed.json`;

  fs.writeFileSync(failedOutputPath, JSON.stringify({ ok: false, retryReason: "retryable_cloudflare_challenge" }));

  const result = writeFetchPayload(outputPath, { ok: true, articleCount: 3 });

  assert.equal(result.wrotePrimaryOutput, true);
  assert.equal(fs.existsSync(failedOutputPath), false);
});
