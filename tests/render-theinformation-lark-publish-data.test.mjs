import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPublishResultToState,
  buildPublishPayload,
  planPublish
} from "../scripts/theinformation-lark-publish-lib.mjs";

function makeLatestData() {
  return {
    coverageWindow: {
      todayDateKey: "2026-04-24",
      cutoffDateKey: "2026-04-23"
    }
  };
}

function makeBriefData() {
  return {
    today_status_summary: [
      "本次覆盖时间窗内共有 4 篇文章进入分析范围。",
      "没有被拦截文章，也没有未处理文章。"
    ],
    featured_articles: [
      {
        title: "Behind Cursor's Deal With SpaceX",
        title_translation: "Cursor 与 SpaceX 交易背后的算力账本",
        section: "Exclusive",
        authors: "Cory Weinberg、Julia Hornstein",
        publication_time: "Apr 24, 2026, 10:41 GMT+8",
        original_link: "https://example.com/cursor",
        core_viewpoint: "AI 应用层仍受模型依赖与算力资本开支约束。",
        key_data_sections: [
          {
            heading: "交易框架与估值跃迁",
            lead: "公司原本处于新一轮融资和估值重定价过程中。",
            bullets: [
              "潜在收购前几周仍在寻求再融资。",
              "潜在估值从 500 亿美元抬升到 600 亿美元。"
            ]
          }
        ],
        insight_sections: [
          {
            heading: "资本市场正在按上游依赖重新给 AI 应用定价",
            lead: "资本开始惩罚高度依赖上游模型与算力的公司。",
            bullets: [
              "投资人不只看增长，也看供应链控制权。"
            ]
          }
        ],
        why_it_matters: "AI 公司若无法掌控模型和算力，估值会持续受压。"
      },
      {
        title: "Berkshire Hathaway, Chubb Win Approval to Drop AI Insurance Coverage",
        section: "Exclusive",
        authors: "Laura Bratton",
        publication_time: "Apr 23, 2026, 21:00 GMT+8",
        original_link: "https://example.com/insurance",
        core_viewpoint: "传统责任险正在把 AI 风险从默认兜底范围中切出去。",
        key_data_sections: [],
        insight_sections: [],
        why_it_matters: "企业 AI 上线成本将不只取决于模型价格。"
      }
    ],
    other_articles: [
      {
        title: "Crypto Hack Puts Big Lender in Turmoil",
        section: "Finance",
        authors: "Yueqi Yang",
        publication_time: "Apr 24, 2026, 02:42 GMT+8",
        original_link: "https://example.com/crypto",
        core_viewpoint: "DeFi 风险通过基础设施漏洞向借贷协议传导。",
        key_data_sections: [
          {
            heading: "攻击路径与损失规模",
            lead: "单点攻击演变成系统性冲击。",
            bullets: [
              "攻击者伪造代币后从 Aave 借出资产。",
              "平台损失预估接近 1.95 亿美元。"
            ]
          }
        ],
        insight_sections: [],
        why_it_matters: "这说明 DeFi 仍存在典型挤兑风险。"
      }
    ],
    partial_articles: [
      {
        title: "How Tech M&A Is Filling AI Gaps",
        section: "Deep Research",
        publication_time: "Apr 23, 2026, 03:25 GMT+8",
        original_link: "https://example.com/mna",
        issue_summary: "正文只保留导语级内容，无法可靠重建。",
        missing_details: [
          "缺少主体论证。",
          "缺少数据口径。"
        ]
      }
    ],
    blocked_articles: [],
    unprocessed_articles: []
  };
}

test("buildPublishPayload derives titles, strips BOM, and builds index entry template", () => {
  const payload = buildPublishPayload({
    latestData: makeLatestData(),
    briefData: makeBriefData(),
    briefText: "\uFEFF# 今日状态摘要\n- 示例"
  });

  assert.equal(payload.reportDateKey, "2026-04-24");
  assert.equal(payload.detailTitle, "The Information Brief 2026-04-24");
  assert.equal(payload.indexTitle, "The Information Daily Archive");
  assert.equal(payload.detailMarkdown.startsWith("\uFEFF"), false);
  assert.match(payload.indexEntryMarkdown, /\{\{DOC_URL\}\}/);
  assert.match(payload.indexEntryMarkdown, /Behind Cursor's Deal With SpaceX/);
  assert.doesNotMatch(payload.indexEntryMarkdown, /状态摘要/);
  assert.doesNotMatch(payload.indexEntryMarkdown, /本次覆盖时间窗内共有 4 篇文章进入分析范围。/);
});

test("buildPublishPayload formats detail markdown for Lark with article numbering and section hierarchy", () => {
  const payload = buildPublishPayload({
    latestData: makeLatestData(),
    briefData: makeBriefData(),
    briefText: "# ignored"
  });

  assert.match(payload.detailMarkdown, /## 文章一/);
  assert.match(payload.detailMarkdown, /## 文章二/);
  assert.match(payload.detailMarkdown, /## 文章三/);
  assert.match(payload.detailMarkdown, /## 文章四/);
  assert.match(payload.detailMarkdown, /Cursor 与 SpaceX 交易背后的算力账本/);
  assert.match(payload.detailMarkdown, /- 栏目：Exclusive/);
  assert.match(payload.detailMarkdown, /- 作者：Cory Weinberg、Julia Hornstein/);
  assert.match(payload.detailMarkdown, /### 核心观点/);
  assert.match(payload.detailMarkdown, /### 关键数据与事实/);
  assert.match(payload.detailMarkdown, /1\. \*\*交易框架与估值跃迁\*\*/);
  assert.match(payload.detailMarkdown, /### 超高颗粒度洞察/);
  assert.match(payload.detailMarkdown, /### 为什么重要/);
  assert.match(payload.detailMarkdown, /### 情况说明/);
  assert.match(payload.detailMarkdown, /### 缺失信息/);
  assert.match(payload.detailMarkdown, /- 缺少主体论证。/);
});

test("planPublish creates both detail and index docs on first publish", () => {
  const payload = buildPublishPayload({
    latestData: makeLatestData(),
    briefData: makeBriefData(),
    briefText: "# 今日状态摘要"
  });

  const plan = planPublish({
    state: null,
    payload
  });

  assert.equal(plan.indexDocAction, "create");
  assert.equal(plan.detailDocAction, "create");
  assert.equal(plan.shouldAppendIndexEntry, true);
  assert.equal(plan.existingDetailDocId, null);
});

test("planPublish updates same-day detail doc without duplicating index entry", () => {
  const payload = buildPublishPayload({
    latestData: makeLatestData(),
    briefData: makeBriefData(),
    briefText: "# 今日状态摘要"
  });

  const plan = planPublish({
    state: {
      version: 1,
      indexDoc: {
        docId: "index-doc-id",
        docUrl: "https://example.com/index"
      },
      detailDocsByDate: {
        "2026-04-24": {
          docId: "detail-doc-id",
          docUrl: "https://example.com/detail",
          title: "The Information Brief 2026-04-24"
        }
      }
    },
    payload
  });

  assert.equal(plan.indexDocAction, "reuse");
  assert.equal(plan.detailDocAction, "update");
  assert.equal(plan.shouldAppendIndexEntry, false);
  assert.equal(plan.existingDetailDocId, "detail-doc-id");
});

test("applyPublishResultToState stores created index and detail doc references", () => {
  const payload = buildPublishPayload({
    latestData: makeLatestData(),
    briefData: makeBriefData(),
    briefText: "# 今日状态摘要"
  });

  const nextState = applyPublishResultToState({
    state: null,
    payload,
    indexDoc: {
      docId: "index-doc-id",
      docUrl: "https://example.com/index"
    },
    detailDoc: {
      docId: "detail-doc-id",
      docUrl: "https://example.com/detail"
    },
    publishedAtIso: "2026-04-24T10:00:00.000Z"
  });

  assert.deepEqual(nextState.indexDoc, {
    docId: "index-doc-id",
    docUrl: "https://example.com/index",
    title: "The Information Daily Archive"
  });
  assert.deepEqual(nextState.detailDocsByDate["2026-04-24"], {
    docId: "detail-doc-id",
    docUrl: "https://example.com/detail",
    title: "The Information Brief 2026-04-24",
    publishedAtIso: "2026-04-24T10:00:00.000Z"
  });
});
