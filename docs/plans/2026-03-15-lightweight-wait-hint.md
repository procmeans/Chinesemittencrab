# Lightweight Wait Hint Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight delayed wait hint for simple Feishu question-and-answer interactions so short questions do not open a progress doc by default.

**Architecture:** Introduce a small helper module that classifies simple text questions and manages a delayed wait notice lifecycle. Wire that helper into the Feishu bot runtime so simple questions keep typing indicators, skip progress docs, and send a short wait hint only after 8 seconds.

**Tech Stack:** Node.js, existing Feishu bot runtime, node:test

---

### Task 1: Add failing tests for the helper behavior

**Files:**
- Create: `/Users/procmeans/Documents/SunCodexClaw/test/lightweight_wait_hint.test.js`

**Step 1: Write a failing classifier test**

Cover:

- short question text returns `true`
- obvious task request returns `false`
- non-text inputs return `false`

**Step 2: Write a failing delayed-notice lifecycle test**

Cover:

- timer is scheduled with the configured delay
- completing before the timer fires sends nothing
- completing after the notice is sent recalls the notice

**Step 3: Run the focused test file**

Run:

```bash
node --test test/lightweight_wait_hint.test.js
```

Expected: FAIL because the helper does not exist yet.

### Task 2: Implement the helper module

**Files:**
- Create: `/Users/procmeans/Documents/SunCodexClaw/tools/lib/lightweight_wait_hint.js`
- Test: `/Users/procmeans/Documents/SunCodexClaw/test/lightweight_wait_hint.test.js`

**Step 1: Implement simple-question classification**

Add a conservative heuristic for short question-like text and exclude obvious task-style requests.

**Step 2: Implement delayed wait notice lifecycle**

Expose a controller that:

- schedules the delayed notice
- sends it once the delay elapses
- recalls it on completion / failure / cancellation

**Step 3: Re-run the focused test file**

Run:

```bash
node --test test/lightweight_wait_hint.test.js
```

Expected: PASS.

### Task 3: Wire the helper into the Feishu runtime

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js`

**Step 1: Resolve the lightweight wait config**

Add a small config resolver with defaults:

- enabled: `true`
- delay: `8000`
- message: `还在思考中，请稍等…`

**Step 2: Route simple questions into the lightweight flow**

When the message is a simple question:

- keep typing indicator
- skip progress reporter / doc start
- schedule the delayed wait hint

**Step 3: Dismiss the wait hint correctly**

Ensure success, failure, and cancellation all dismiss the wait hint cleanly.

### Task 4: Run verification

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js`
- Create: `/Users/procmeans/Documents/SunCodexClaw/tools/lib/lightweight_wait_hint.js`
- Create: `/Users/procmeans/Documents/SunCodexClaw/test/lightweight_wait_hint.test.js`

**Step 1: Run the related test suite**

Run:

```bash
node --test test/lightweight_wait_hint.test.js test/message_actionability.test.js test/mention_carry.test.js
```

Expected: PASS.

**Step 2: Run the full test suite**

Run:

```bash
node --test test/*.test.js
```

Expected: PASS.

**Step 3: Dry-run the default bot**

Run:

```bash
node tools/feishu_ws_bot.js --account default --dry-run
```

Expected: bot config prints the lightweight wait settings alongside the existing typing / progress settings.
