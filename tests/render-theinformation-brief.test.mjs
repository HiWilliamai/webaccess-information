import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(".");
const rendererPath = path.join(root, "scripts", "render-theinformation-brief.mjs");

function makeFixture() {
  return {
    today_status_summary: [
      "本次抓取完成，包含 1 篇重点文章。",
      "没有正文不完整文章，也没有被拦截文章。"
    ],
    featured_articles: [
      {
        title: "Amazon’s AI Chat Ads Yield Data but Few Sales",
        section: "Marketing",
        authors: "Jane Doe",
        publication_time: "Apr 04, 2026, 09:30 GMT+8",
        original_link: "https://www.theinformation.com/articles/amazon-ai-chat-ads",
        core_viewpoint:
          "亚马逊的聊天广告现阶段更像数据采集与算法反哺工具，而不是已经成熟的销量转化引擎。",
        key_data_sections: [
          {
            heading: "流量与点击转化极其惨淡",
            lead: "这部分数据说明新广告位虽然新颖，但绝对流量仍然偏小。",
            bullets: [
              "传统广告贡献 500,000 次点击，而聊天广告只有 88 次点击。",
              "赞助提示在赞助产品广告总点击量中的占比不到 1%。"
            ]
          }
        ],
        insight_sections: [
          {
            heading: "算法窥探与反哺",
            lead: "广告主真正买到的是对 AI 推荐逻辑的反向观察窗口。",
            bullets: [
              "营销团队会分析 AI 自动生成的问题，反推消费者关注点。",
              "这些洞察随后被用于改写商品详情页和店铺文案。"
            ]
          }
        ],
        why_it_matters:
          "这意味着亚马逊的聊天广告商业化价值可能先体现在数据与运营优化，而不是短期 GMV 爆发。"
      }
    ],
    other_articles: [],
    partial_articles: [],
    blocked_articles: [],
    unprocessed_articles: []
  };
}

test("renderer outputs the new Chinese brief section structure", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ti-brief-render-"));
  const inputPath = path.join(tempDir, "brief.json");
  const textPath = path.join(tempDir, "brief.txt");
  const htmlPath = path.join(tempDir, "brief.html");

  fs.writeFileSync(inputPath, JSON.stringify(makeFixture()), "utf8");

  execFileSync("node", [rendererPath, "--input", inputPath, "--text-output", textPath, "--html-output", htmlPath], {
    cwd: root,
    stdio: "pipe"
  });

  const text = fs.readFileSync(textPath, "utf8");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.match(text, /##核心观点/);
  assert.match(text, /##关键数据与事实（超高颗粒度）/);
  assert.match(text, /##超高颗粒度洞察/);
  assert.match(text, /##为什么重要/);
  assert.match(text, /### 流量与点击转化极其惨淡/);
  assert.match(text, /### 算法窥探与反哺/);
  assert.doesNotMatch(text, /运行机制与营销者洞察/);

  assert.match(html, /<h3>核心观点<\/h3>/);
  assert.match(html, /<h3>关键数据与事实（超高颗粒度）<\/h3>/);
  assert.match(html, /<h3>超高颗粒度洞察<\/h3>/);
  assert.match(html, /<h3>为什么重要<\/h3>/);
});
