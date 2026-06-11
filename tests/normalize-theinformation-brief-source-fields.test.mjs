import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBriefSourceFields } from "../scripts/normalize-theinformation-brief-source-fields.mjs";

test("replaces generated article titles with source titles matched by canonical URL", () => {
  const latest = {
    articles: [
      {
        title: "Twilio’s AI Boost Is a Double-Edged Sword",
        canonicalUrl: "https://www.theinformation.com/articles/twilios-ai-boost-double-edged-sword"
      }
    ],
    partialArticles: [],
    blockedArticles: [],
    unprocessedArticles: [
      {
        title: "on… Anthropic and OpenAI’s Share of AI Startup Revenues Rises to 89%",
        canonicalUrl:
          "https://www.theinformation.com/articles/anthropic-openais-share-ai-startup-revenues-rises-89"
      }
    ]
  };
  const brief = {
    featured_articles: [
      {
        title: "Twilio?s AI Boost Is a Double-Edged Sword",
        original_link:
          "https://www.theinformation.com/articles/twilios-ai-boost-double-edged-sword?rc=eg0wqy"
      }
    ],
    other_articles: [],
    partial_articles: [],
    blocked_articles: [],
    unprocessed_articles: [
      {
        title: "on? Anthropic and OpenAI?s Share of AI Startup Revenues Rises to 89%",
        original_link:
          "https://www.theinformation.com/articles/anthropic-openais-share-ai-startup-revenues-rises-89"
      }
    ]
  };

  const normalized = normalizeBriefSourceFields({ latest, brief });

  assert.equal(normalized.featured_articles[0].title, "Twilio’s AI Boost Is a Double-Edged Sword");
  assert.equal(
    normalized.unprocessed_articles[0].title,
    "on… Anthropic and OpenAI’s Share of AI Startup Revenues Rises to 89%"
  );
  assert.equal(
    normalized.featured_articles[0].original_link,
    "https://www.theinformation.com/articles/twilios-ai-boost-double-edged-sword"
  );
});
