# Project Overview Document Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write `docs/project-overview.md` as an owner-focused architecture overview of the current Feishu-based SunCodexClaw system.

**Architecture:** The document should complement `README.md` rather than duplicate it. It will describe the current runtime layers, message/task flow, key module map, multi-bot configuration model, existing enhancements, and already-discussed future directions.

**Tech Stack:** Markdown, existing repository docs, `tools/feishu_ws_bot.js`, `tools/lib/*.js`

---

### Task 1: Inventory the current implementation facts

**Files:**
- Read: `/Users/procmeans/Documents/SunCodexClaw/README.md`
- Read: `/Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js`
- Read: `/Users/procmeans/Documents/SunCodexClaw/tools/lib/*.js`
- Read: `/Users/procmeans/Documents/SunCodexClaw/docs/plans/*.md`
- Create: `/Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md`

**Step 1: Create the document skeleton**

Add the 7 approved headings to `docs/project-overview.md` with short placeholders under each heading.

**Step 2: Gather source facts**

Extract notes for:
- architecture layers
- message flow
- key module entry points
- config layering
- multi-bot isolation boundaries
- implemented enhancements
- planned directions already discussed

**Step 3: Verify the inventory is sufficient**

Check that each of the 7 sections has enough concrete source material before writing prose.

Run:

```bash
rg -n "项目定位|运行架构|消息与任务链路|关键模块索引|配置与多机器人模型|当前已做增强|已规划能力与建议" /Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md
```

Expected: all 7 headings are present.

### Task 2: Draft the architecture core of the overview

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md`
- Read: `/Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js`

**Step 1: Write `项目定位`**

Describe:
- what problem the project solves
- what its current boundary is
- what this internal doc is for

Keep it concise and non-marketing.

**Step 2: Write `运行架构`**

Describe the runtime as layers:
- Feishu ingress
- Codex execution
- task/context orchestration
- reply/progress feedback
- local process and launchagent runtime

Include specific file references inside the prose.

**Step 3: Write `消息与任务链路`**

Explain the lifecycle from incoming Feishu event to normalized inputs, Codex execution, progress reporting, and final reply delivery.

**Step 4: Review the architecture sections**

Read the first three sections and check:
- they describe the real system rather than the ideal system
- they do not duplicate install/setup walkthroughs from `README.md`

### Task 3: Build the module and configuration map

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md`
- Read: `/Users/procmeans/Documents/SunCodexClaw/tools/lib/*.js`

**Step 1: Write `关键模块索引`**

Group the main files by responsibility, for example:
- runtime entry
- message parsing and routing
- task queue and actionability
- mention carry and quoted context
- doc/progress and reply rendering
- monitor/status helpers

Each group should tell the reader where to start reading.

**Step 2: Write `配置与多机器人模型`**

Explain:
- config precedence
- account-specific overrides
- per-bot `cwd`
- process separation
- current shared resources that are still host-level

Be explicit about partial isolation vs full isolation.

**Step 3: Verify linkability**

Check that the section names and file references are concrete enough that the owner can jump to code quickly.

### Task 4: Record the implemented enhancements and planned directions

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md`
- Read: `/Users/procmeans/Documents/SunCodexClaw/docs/plans/*.md`

**Step 1: Write `当前已做增强`**

Summarize the major enhancements that now exist beyond the repo’s original baseline, including:
- explicit bot naming and `bot_open_id` reconciliation
- group mention carry behavior
- group file handling
- quoted message context
- same-scope queueing and supersede behavior
- target-chat-by-name routing
- Markdown card replies
- local monitor panel

**Step 2: Write `已规划能力与建议`**

Only include directions already discussed, such as:
- deeper bot isolation
- monitor panel expansion
- permission tightening
- enterprise WeCom migration feasibility

Make the “not yet implemented” status explicit.

**Step 3: Review truthfulness**

Check that nothing in these two sections implies a capability is implemented if it is only planned.

### Task 5: Final polish and verification

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md`
- Optional Modify: `/Users/procmeans/Documents/SunCodexClaw/README.md`

**Step 1: Tighten wording**

Remove duplication, vague statements, and marketing-style language. Prefer short paragraphs and direct file references.

**Step 2: Optionally add a README pointer**

If it improves discoverability without clutter, add one short internal-doc pointer from `README.md` to `docs/project-overview.md`.

**Step 3: Run final verification**

Run:

```bash
sed -n '1,260p' /Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md
rg -n "规划|未实现|已实现|TODO|待定" /Users/procmeans/Documents/SunCodexClaw/docs/project-overview.md
```

Expected:
- the document reads as a coherent owner-facing system overview
- planned items are clearly distinguishable from implemented items
- there are no placeholder headings left behind
