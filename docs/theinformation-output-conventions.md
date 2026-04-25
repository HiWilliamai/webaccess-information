# The Information Output Conventions

## Default Output Rules

This project now uses two different output conventions for the same The Information brief data:

- Local outputs remain unchanged.
- Lark detail documents use a simplified publishing template.

These rules are the default going forward unless a later change explicitly updates them.

## Local Outputs

The local files in `output/manual` and `output/automation` keep the existing project format:

- `theinformation-latest.json`
- `theinformation-latest.txt`
- `theinformation-latest.html`
- `theinformation-brief.json`
- `theinformation-brief.txt`
- `theinformation-brief.html`

The local renderers should not be changed just to satisfy Lark formatting preferences.

## Lark Detail Documents

Lark detail documents are intentionally formatted more simply than the local HTML output.

Required rules:

- Use a lightweight text-first template.
- Do not add images.
- Do not delete, summarize, or rewrite original brief content.
- Preserve all existing article content and section content.
- Keep article boundaries explicit with labels such as `文章一`, `文章二`, `文章三`.
- Show the English title first.
- Show the Chinese title translation directly under the English title when `title_translation` exists.
- Render article metadata as simple list items.
- Use simple section headings such as `### 核心观点`, `### 关键数据与事实`, `### 超高颗粒度洞察`, `### 为什么重要`.

## Lark Index Documents

The Lark index document remains a lightweight archive page:

- one entry per report date
- link to the daily detail document
- short featured-title list
- no daily status-summary list

## Publishing Behavior

Automatic mode should continue to behave as follows:

- Local outputs are overwritten with the newest run.
- Lark receives the published archive copy.
- The same report date updates the same Lark detail document.
- Re-running the same date must not duplicate the index entry.

## Implementation Notes

The current Lark-specific formatting behavior is implemented in:

- `scripts/theinformation-lark-publish-lib.mjs`
- `scripts/publish-theinformation-brief-to-lark.ps1`

The current tests that cover this behavior are:

- `tests/render-theinformation-lark-publish-data.test.mjs`
- `tests/render-theinformation-brief.test.mjs`
