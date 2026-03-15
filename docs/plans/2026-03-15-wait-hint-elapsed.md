# Wait Hint Elapsed Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the lightweight Feishu wait hint so it keeps the same message alive and refreshes its elapsed-time text every 15 seconds.

**Architecture:** Extend the existing lightweight wait helper to support one initial delayed send plus periodic updates on the same message. Reuse the current Feishu message update and recall paths so the runtime still cleans up on success, failure, or cancellation.

**Tech Stack:** Node.js, existing Feishu bot runtime, node:test

---

### Task 1: Add failing tests for elapsed wait updates

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/test/lightweight_wait_hint.test.js`

**Step 1: Add a failing elapsed-update test**

Cover:

- initial notice fires after the configured delay
- the same notice is updated every configured interval
- the updated text includes elapsed seconds

**Step 2: Run the focused test file**

Run:

```bash
node --test test/lightweight_wait_hint.test.js
```

Expected: FAIL because the helper does not support periodic updates yet.

### Task 2: Extend the helper implementation

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/tools/lib/lightweight_wait_hint.js`
- Test: `/Users/procmeans/Documents/SunCodexClaw/test/lightweight_wait_hint.test.js`

**Step 1: Add periodic update scheduling**

After the first notice is sent, schedule repeated updates at the configured interval.

**Step 2: Add elapsed-time rendering**

Render the first notice as a short static message, then render later updates with `已等待 XX 秒`.

**Step 3: Keep dismissal semantics clean**

Dismiss must:

- cancel pending timers
- stop future updates
- recall the existing notice if one was already sent

**Step 4: Re-run the focused test file**

Run:

```bash
node --test test/lightweight_wait_hint.test.js
```

Expected: PASS.

### Task 3: Wire interval config into the runtime

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js`

**Step 1: Add a configurable update interval**

Expose a default of `15000` ms in the lightweight wait config resolver.

**Step 2: Pass the update function into the helper**

Use the existing Feishu text-message update path so the same notice message is edited in place.

**Step 3: Print the new config in dry-run output**

So the runtime behavior remains inspectable.

### Task 4: Verify the updated flow

**Files:**
- Modify: `/Users/procmeans/Documents/SunCodexClaw/tools/lib/lightweight_wait_hint.js`
- Modify: `/Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js`
- Modify: `/Users/procmeans/Documents/SunCodexClaw/test/lightweight_wait_hint.test.js`

**Step 1: Run focused tests**

Run:

```bash
node --test test/lightweight_wait_hint.test.js
```

Expected: PASS.

**Step 2: Run the full suite**

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

Expected: the dry-run output includes both lightweight wait delay and update interval settings.
