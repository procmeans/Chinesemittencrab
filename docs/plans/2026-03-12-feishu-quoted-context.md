# Feishu Quoted Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Feishu group quote replies include the referenced message body in the bot prompt context.

**Architecture:** Add a small helper that resolves one referenced message from `parent_id` or `root_id`, parses its body into plain text, and lets the main WebSocket handler prepend that text to both the live Codex prompt and the compact conversation history entry.

**Tech Stack:** Node.js, `node:test`, Feishu `@larksuiteoapi/node-sdk`

---

### Task 1: Add the failing tests

**Files:**
- Create: `test/referenced_message_context.test.js`
- Create: `tools/lib/referenced_message_context.js`

**Step 1: Write the failing test**

Add tests that prove:
- the helper prefers `parent_id` over `root_id`
- the helper can fetch and parse referenced text messages
- the helper composes `引用消息` plus `当前消息`

**Step 2: Run test to verify it fails**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/referenced_message_context.test.js`
Expected: FAIL because `tools/lib/referenced_message_context.js` does not exist yet.

### Task 2: Implement the minimal helper

**Files:**
- Modify: `tools/lib/referenced_message_context.js`
- Test: `test/referenced_message_context.test.js`

**Step 1: Write minimal implementation**

Implement:
- referenced message id selection
- plain-text parsing for referenced `text` and `post` messages
- one-hop fetch with graceful fallback
- prompt composition helper

**Step 2: Run the focused test**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/referenced_message_context.test.js`
Expected: PASS

### Task 3: Wire the helper into the bot

**Files:**
- Modify: `tools/feishu_ws_bot.js`
- Test: `test/referenced_message_context.test.js`

**Step 1: Attach quoted context to message handling**

Update the main handler so text, file, audio, and image flows can prepend the resolved quoted text into:
- `userText`
- `historyUserText`

Add a short log when referenced context is attached.

**Step 2: Run focused regressions**

Run:
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/referenced_message_context.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/message_actionability.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/mention_carry.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/task_queue.test.js`

Expected: PASS

### Task 4: Verify runtime behavior

**Files:**
- Modify: `tools/feishu_ws_bot.js`

**Step 1: Dry-run the bot**

Run: `node /Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js --account default --dry-run`
Expected: PASS with the normal startup summary.

**Step 2: Restart the running bots**

Run:
- `bash /Users/procmeans/Documents/SunCodexClaw/tools/install_feishu_launchagents.sh install default`
- `bash /Users/procmeans/Documents/SunCodexClaw/tools/install_feishu_launchagents.sh install second`

Expected: both services return to `running`.
