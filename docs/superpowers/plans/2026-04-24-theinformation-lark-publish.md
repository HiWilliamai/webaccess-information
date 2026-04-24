# The Information Lark Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional automation-only Feishu publish step that keeps local outputs as overwrite-only files, creates or updates one daily detail doc in Feishu, and maintains a separate Feishu index doc with one entry per report date.

**Architecture:** Keep the current fetch/render/brief pipeline unchanged. Add a pure data-rendering helper that converts existing local outputs into publish payloads, then add a PowerShell publisher that calls `lark-cli docs +create/+update` and persists minimal local publish state so same-day reruns update the same detail doc without duplicating index entries. Wire this publisher only into the scheduled automation wrapper.

**Tech Stack:** PowerShell, Node.js, `node:test`, `lark-cli`

---

### Task 1: Publish Payload Renderer

**Files:**
- Create: `D:\codex\webaccess\scripts\render-theinformation-lark-publish-data.mjs`
- Test: `D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement a minimal renderer that reads latest + brief files and emits publish metadata**
- [ ] **Step 4: Run test to verify it passes**

### Task 2: Feishu Publish Script

**Files:**
- Create: `D:\codex\webaccess\scripts\publish-theinformation-brief-to-lark.ps1`
- Modify: `D:\codex\webaccess\scripts\run-ti-daily-scheduled.ps1`

- [ ] **Step 1: Write a failing automation-focused test for publish data assumptions if needed**
- [ ] **Step 2: Implement the publisher with local state for index/detail doc ids**
- [ ] **Step 3: Wire scheduled automation to call the publisher only when enabled**
- [ ] **Step 4: Run targeted commands to verify the non-Lark path still works**

### Task 3: Verification

**Files:**
- Modify: `D:\codex\webaccess\tests\render-theinformation-lark-publish-data.test.mjs`

- [ ] **Step 1: Run the new test file**
- [ ] **Step 2: Run the existing brief renderer test**
- [ ] **Step 3: Summarize required Feishu config knobs for first real publish**
