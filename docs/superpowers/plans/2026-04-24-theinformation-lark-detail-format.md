# The Information 飞书明细文档层级优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅调整飞书明细文档的 Markdown 层级与编号，让多篇文章和单篇文章内部结构更清晰，同时保持本地输出完全不变。

**Architecture:** 继续沿用本地 brief 生成链路，在飞书发布载荷阶段新增“飞书专用 Markdown”生成逻辑。该逻辑直接消费 `theinformation-brief.json` 的结构化数据，输出 `文章一 / 一、二、三 / 1. 2. 3.` 风格的明细文档，发布脚本继续只负责创建或更新飞书文档。

**Tech Stack:** Node.js ESM, PowerShell, `node:test`, `lark-cli`

---

### Task 1: 为飞书专用 Markdown 增加测试

**Files:**
- Modify: `D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs`
- Modify: `D:\codex\webaccess\scripts\theinformation-lark-publish-lib.mjs`

- [ ] **Step 1: Write the failing test**

```js
test("buildPublishPayload formats detail markdown for Lark with article numbering", () => {
  const payload = buildPublishPayload({
    latestData: makeLatestData(),
    briefData: makeBriefData(),
    briefText: "# ignored"
  });

  assert.match(payload.detailMarkdown, /## 文章一/);
  assert.match(payload.detailMarkdown, /一、文章信息/);
  assert.match(payload.detailMarkdown, /1\. 栏目：/);
  assert.match(payload.detailMarkdown, /二、核心观点/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs`
Expected: FAIL because current `detailMarkdown` 仍直接使用 `brief.txt`，不包含新的飞书层级结构。

- [ ] **Step 3: Write minimal implementation**

```js
function buildLarkDetailMarkdown(briefData) {
  // render featured_articles / other_articles / partial_articles
  // into article-numbered markdown only for Lark publishing
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs D:\codex\webaccess\scripts\theinformation-lark-publish-lib.mjs
git commit -m "feat: format lark detail briefs with clearer hierarchy"
```

### Task 2: 将飞书明细改为结构化渲染并验证兼容

**Files:**
- Modify: `D:\codex\webaccess\scripts\theinformation-lark-publish-lib.mjs`
- Test: `D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs`

- [ ] **Step 1: Extend rendering helpers**

```js
function toChineseArticleLabel(index) {
  return `文章${["一", "二", "三"][index] ?? String(index + 1)}`;
}
```

- [ ] **Step 2: Render featured/other/partial articles with section numbering**

```js
// 一、文章信息
// 二、核心观点
// 三、关键数据与事实
// 四、超高颗粒度洞察
// 五、为什么重要
```

- [ ] **Step 3: Keep fallbacks safe**

```js
const detailMarkdown = buildLarkDetailMarkdown(briefData) || normalizeText(briefText);
```

- [ ] **Step 4: Run targeted tests**

Run: `node --test D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs`
Expected: PASS

- [ ] **Step 5: Run existing related test**

Run: `node --test D:\codex\webaccess\tests\render-theinformation-brief.test.mjs`
Expected: PASS

### Task 3: 真实更新今日飞书明细文档

**Files:**
- Modify: `D:\codex\webaccess\output\automation\theinformation-lark-publish-state.json` (runtime output only)
- Use: `D:\codex\webaccess\scripts\publish-theinformation-brief-to-lark.ps1`

- [ ] **Step 1: Run publish script against current automation output**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File D:\codex\webaccess\scripts\publish-theinformation-brief-to-lark.ps1 -LatestJsonPath D:\codex\webaccess\output\automation\theinformation-latest.json -BriefJsonPath D:\codex\webaccess\output\automation\theinformation-brief.json -BriefTextPath D:\codex\webaccess\output\automation\theinformation-brief.txt -StatePath D:\codex\webaccess\output\automation\theinformation-lark-publish-state.json -Identity user
```

- [ ] **Step 2: Confirm same-day update behavior**

Expected:
- existing detail doc is updated, not recreated
- index doc is unchanged
- local brief outputs remain untouched

- [ ] **Step 3: Review final doc URLs and report back**

```text
Index doc: https://www.feishu.cn/docx/...
Detail doc: https://www.feishu.cn/docx/...
```
