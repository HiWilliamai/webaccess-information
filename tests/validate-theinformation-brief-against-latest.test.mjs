import test from "node:test";
import assert from "node:assert/strict";

import { validateBriefAgainstLatest } from "../scripts/validate-theinformation-brief-against-latest.mjs";

test("rejects briefs that omit source articles or invent titles", () => {
  const latest = {
    articles: [{ title: "Source A" }, { title: "Source B" }],
    partialArticles: [{ title: "Partial C" }],
    blockedArticles: [],
    unprocessedArticles: []
  };
  const brief = {
    featured_articles: [{ title: "Source A" }],
    other_articles: [{ title: "Invented D" }],
    partial_articles: [],
    blocked_articles: [],
    unprocessed_articles: []
  };

  const result = validateBriefAgainstLatest(latest, brief);

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingTitles, ["Source B", "Partial C"]);
  assert.deepEqual(result.unknownTitles, ["Invented D"]);
});

test("accepts briefs that cover every source title exactly once across sections", () => {
  const latest = {
    articles: [{ title: "Source A" }],
    partialArticles: [{ title: "Partial B" }],
    blockedArticles: [],
    unprocessedArticles: [{ linkText: "Unprocessed C" }]
  };
  const brief = {
    featured_articles: [{ title: "Source A" }],
    other_articles: [],
    partial_articles: [{ title: "Partial B" }],
    blocked_articles: [],
    unprocessed_articles: [{ title: "Unprocessed C" }]
  };

  const result = validateBriefAgainstLatest(latest, brief);

  assert.equal(result.ok, true);
  assert.equal(result.expectedCount, 3);
  assert.equal(result.actualCount, 3);
});

test("accepts titles when smart apostrophes are degraded to question marks", () => {
  const latest = {
    articles: [
      { title: "Exclusive: OpenAI’s Altman Talks to Staff About IPO Timing" },
      { title: "SpaceX’s Revenue Growth Slowed to 15% in First Quarter" }
    ],
    partialArticles: [],
    blockedArticles: [],
    unprocessedArticles: [{ title: "Nvidia’s Blowout and SpaceX’s Blue Sky Ambitions" }]
  };
  const brief = {
    featured_articles: [
      { title: "Exclusive: OpenAI?s Altman Talks to Staff About IPO Timing" },
      { title: "SpaceX?s Revenue Growth Slowed to 15% in First Quarter" }
    ],
    other_articles: [],
    partial_articles: [],
    blocked_articles: [],
    unprocessed_articles: [{ title: "Nvidia?s Blowout and SpaceX?s Blue Sky Ambitions" }]
  };

  const result = validateBriefAgainstLatest(latest, brief);

  assert.equal(result.ok, true);
  assert.deepEqual(result.missingTitles, []);
  assert.deepEqual(result.unknownTitles, []);
});

test("accepts titles when ellipses are degraded to question marks", () => {
  const latest = {
    articles: [],
    partialArticles: [],
    blockedArticles: [],
    unprocessedArticles: [
      { title: "on\u2026 Anthropic and OpenAI\u2019s Share of AI Startup Revenues Rises to 89%" }
    ]
  };
  const brief = {
    featured_articles: [],
    other_articles: [],
    partial_articles: [],
    blocked_articles: [],
    unprocessed_articles: [
      { title: "on? Anthropic and OpenAI?s Share of AI Startup Revenues Rises to 89%" }
    ]
  };

  const result = validateBriefAgainstLatest(latest, brief);

  assert.equal(result.ok, true);
  assert.deepEqual(result.missingTitles, []);
  assert.deepEqual(result.unknownTitles, []);
});

test("matches articles by canonical URL before comparing generated titles", () => {
  const latest = {
    articles: [
      {
        title: "OpenAI\u2019s Revenue Story",
        canonicalUrl: "https://www.theinformation.com/articles/openai-revenue-story"
      }
    ],
    partialArticles: [],
    blockedArticles: [],
    unprocessedArticles: [
      {
        title: "on\u2026 Anthropic and OpenAI\u2019s Share of AI Startup Revenues Rises to 89%",
        canonicalUrl:
          "https://www.theinformation.com/articles/anthropic-openais-share-ai-startup-revenues-rises-89"
      }
    ]
  };
  const brief = {
    featured_articles: [
      {
        title: "Generated title drift for the same OpenAI article",
        original_link:
          "https://www.theinformation.com/articles/openai-revenue-story?rc=eg0wqy"
      }
    ],
    other_articles: [],
    partial_articles: [],
    blocked_articles: [],
    unprocessed_articles: [
      {
        title: "Generated title drift for the same AI startup revenue article",
        original_link:
          "https://www.theinformation.com/articles/anthropic-openais-share-ai-startup-revenues-rises-89"
      }
    ]
  };

  const result = validateBriefAgainstLatest(latest, brief);

  assert.equal(result.ok, true);
  assert.deepEqual(result.missingTitles, []);
  assert.deepEqual(result.unknownTitles, []);
});
