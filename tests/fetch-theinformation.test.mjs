import test from "node:test";
import assert from "node:assert/strict";

import { extractArticleMetadata, isLikelyValidArticleCapture, pickArticleLinks } from "../scripts/fetch-theinformation.mjs";

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
