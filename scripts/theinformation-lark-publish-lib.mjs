function normalizeText(value) {
  return String(value || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
}

function buildIndexEntryMarkdown({ reportDateKey, detailTitle, featuredTitles, statusSummary }) {
  const featuredLines =
    featuredTitles.length > 0 ? featuredTitles.map((title) => `  - ${title}`).join("\n") : "  - 暂无";
  const statusLines =
    statusSummary.length > 0 ? statusSummary.map((item) => `  - ${item}`).join("\n") : "  - 暂无";

  return [
    `## ${reportDateKey}`,
    "",
    `- 明细文档：[${detailTitle}]({{DOC_URL}})`,
    "- 重点文章：",
    featuredLines,
    "- 状态摘要：",
    statusLines
  ].join("\n");
}

function toChineseNumber(value) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) {
    return ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][value];
  }

  if (value < 20) {
    return `十${digits[value - 10]}`;
  }

  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${digits[tens]}十${ones === 0 ? "" : digits[ones]}`;
  }

  return String(value);
}

function toArticleLabel(index) {
  return `文章${toChineseNumber(index + 1)}`;
}

function compactLines(lines) {
  const compacted = [];

  for (const line of lines) {
    const value = line == null ? "" : String(line);
    if (value === "" && compacted[compacted.length - 1] === "") {
      continue;
    }

    compacted.push(value);
  }

  while (compacted[compacted.length - 1] === "") {
    compacted.pop();
  }

  return compacted.join("\n");
}

function appendNumberedItems(lines, values, formatter) {
  let itemIndex = 1;

  for (const value of values) {
    const formatted = formatter(value);
    if (!formatted) {
      continue;
    }

    lines.push(`${itemIndex}. ${formatted}`);
    itemIndex += 1;
  }
}

function buildArticleInfoItems(article) {
  return [
    article.section ? `栏目：${normalizeText(article.section)}` : "",
    article.authors ? `作者：${normalizeText(article.authors)}` : "",
    article.publication_time ? `发布时间：${normalizeText(article.publication_time)}` : "",
    article.original_link ? `原文链接：${normalizeText(article.original_link)}` : ""
  ].filter(Boolean);
}

function buildStructuredSection(sectionNumberLabel, title, sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [];
  }

  const heading = sectionNumberLabel === "###" ? `### ${title}` : `${sectionNumberLabel}、${title}`;
  const lines = [heading];
  appendNumberedItems(lines, sections, (section) => {
    const heading = normalizeText(section?.heading);
    if (!heading) {
      return "";
    }

    const detailLines = [];
    const lead = normalizeText(section?.lead);
    if (lead) {
      detailLines.push(`**${heading}**`);
      detailLines.push(`   ${lead}`);
    } else {
      detailLines.push(`**${heading}**`);
    }

    const bullets = Array.isArray(section?.bullets) ? section.bullets.map((item) => normalizeText(item)).filter(Boolean) : [];
    for (const bullet of bullets) {
      detailLines.push(`   - ${bullet}`);
    }

    return detailLines.join("\n");
  });

  return [...lines, ""];
}

function buildNormalArticleMarkdown(article, articleIndex) {
  const lines = [`## ${toArticleLabel(articleIndex)}`, ""];
  const title = normalizeText(article?.title);
  if (title) {
    lines.push(title, "");
  }

  const titleTranslation = normalizeText(article?.title_translation);
  if (titleTranslation) {
    lines.push(titleTranslation, "");
  }

  for (const item of buildArticleInfoItems(article)) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  const coreViewpoint = normalizeText(article?.core_viewpoint);
  if (coreViewpoint) {
    lines.push("### 核心观点", coreViewpoint, "");
  }

  lines.push(...buildStructuredSection("###", "关键数据与事实", article?.key_data_sections));
  lines.push(...buildStructuredSection("###", "超高颗粒度洞察", article?.insight_sections));

  const whyItMatters = normalizeText(article?.why_it_matters);
  if (whyItMatters) {
    lines.push("### 为什么重要", whyItMatters, "");
  }

  return compactLines(lines);
}

function buildPartialArticleMarkdown(article, articleIndex) {
  const lines = [`## ${toArticleLabel(articleIndex)}`, ""];
  const title = normalizeText(article?.title);
  if (title) {
    lines.push(title, "");
  }

  for (const item of buildArticleInfoItems(article)) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  const issueSummary = normalizeText(article?.issue_summary);
  if (issueSummary) {
    lines.push("### 情况说明", issueSummary, "");
  }

  const missingDetails = Array.isArray(article?.missing_details)
    ? article.missing_details.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (missingDetails.length > 0) {
    lines.push("### 缺失信息");
    for (const item of missingDetails) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return compactLines(lines);
}

function buildLarkDetailMarkdown(briefData) {
  const summaryLines = Array.isArray(briefData?.today_status_summary)
    ? briefData.today_status_summary.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  const articleGroups = [
    ...(Array.isArray(briefData?.featured_articles) ? briefData.featured_articles.map((article) => ({ type: "normal", article })) : []),
    ...(Array.isArray(briefData?.other_articles) ? briefData.other_articles.map((article) => ({ type: "normal", article })) : []),
    ...(Array.isArray(briefData?.partial_articles) ? briefData.partial_articles.map((article) => ({ type: "partial", article })) : [])
  ].filter((item) => item.article);

  if (articleGroups.length === 0) {
    return "";
  }

  const lines = [];

  if (summaryLines.length > 0) {
    lines.push("# 今日状态摘要");
    for (const summaryLine of summaryLines) {
      lines.push(`- ${summaryLine}`);
    }
    lines.push("");
  }

  lines.push("# 今日明细");
  lines.push("");

  articleGroups.forEach((entry, index) => {
    const block =
      entry.type === "partial"
        ? buildPartialArticleMarkdown(entry.article, index)
        : buildNormalArticleMarkdown(entry.article, index);

    lines.push(block, "");
  });

  return compactLines(lines);
}

export function buildPublishPayload({
  latestData,
  briefData,
  briefText,
  detailTitlePrefix = "The Information Brief",
  indexTitle = "The Information Daily Archive"
}) {
  const reportDateKey = latestData?.coverageWindow?.todayDateKey || new Date().toISOString().slice(0, 10);
  const detailTitle = `${detailTitlePrefix} ${reportDateKey}`;
  const detailMarkdown = buildLarkDetailMarkdown(briefData) || normalizeText(briefText);
  const featuredTitles = (briefData?.featured_articles || [])
    .map((item) => normalizeText(item?.title))
    .filter(Boolean)
    .slice(0, 5);
  const statusSummary = (briefData?.today_status_summary || []).map((item) => normalizeText(item)).filter(Boolean).slice(0, 3);

  return {
    reportDateKey,
    detailTitle,
    detailMarkdown,
    indexTitle,
    indexHeaderMarkdown: [
      "# The Information Daily Archive",
      "",
      "自动模式每天会在这里记录一篇飞书明细文档，方便按日期回看。"
    ].join("\n"),
    indexEntryMarkdown: buildIndexEntryMarkdown({
      reportDateKey,
      detailTitle,
      featuredTitles,
      statusSummary
    }),
    featuredTitles,
    statusSummary
  };
}

export function planPublish({ state, payload }) {
  const currentState = state || {};
  const existingIndexDoc = currentState.indexDoc || null;
  const existingDetailDoc = currentState.detailDocsByDate?.[payload.reportDateKey] || null;

  return {
    indexDocAction: existingIndexDoc ? "reuse" : "create",
    detailDocAction: existingDetailDoc ? "update" : "create",
    shouldAppendIndexEntry: !existingDetailDoc,
    existingIndexDocId: existingIndexDoc?.docId || null,
    existingDetailDocId: existingDetailDoc?.docId || null,
    existingDetailDocUrl: existingDetailDoc?.docUrl || null
  };
}

export function applyPublishResultToState({ state, payload, indexDoc, detailDoc, publishedAtIso }) {
  const nextState = {
    version: 1,
    indexDoc: state?.indexDoc || null,
    detailDocsByDate: {
      ...(state?.detailDocsByDate || {})
    }
  };

  if (indexDoc?.docId && indexDoc?.docUrl) {
    nextState.indexDoc = {
      docId: indexDoc.docId,
      docUrl: indexDoc.docUrl,
      title: payload.indexTitle
    };
  }

  if (detailDoc?.docId && detailDoc?.docUrl) {
    nextState.detailDocsByDate[payload.reportDateKey] = {
      docId: detailDoc.docId,
      docUrl: detailDoc.docUrl,
      title: payload.detailTitle,
      publishedAtIso: publishedAtIso || null
    };
  }

  return nextState;
}
