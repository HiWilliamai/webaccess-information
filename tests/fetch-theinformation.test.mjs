import test from "node:test";
import assert from "node:assert/strict";

import { isLikelyValidArticleCapture } from "../scripts/fetch-theinformation.mjs";

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
