# Feishu Bot Monitor Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-only read-only web panel that shows each Feishu bot’s liveness, current stage, waited time, and likely stuck status.

**Architecture:** Add a structured runtime status writer inside the existing bot process, persist per-account snapshots under `.runtime/feishu/status`, then serve a tiny local dashboard from a Node HTTP server that derives health from snapshot freshness and real process state.

**Tech Stack:** Node.js built-in `http`, `fs`, `path`, `node:test`, existing Feishu bot runtime

---

### Task 1: Add the runtime status helper with failing tests

**Files:**
- Create: `tools/lib/runtime_status_store.js`
- Create: `test/runtime_status_store.test.js`

**Step 1: Write the failing test**

Cover:
- creating a per-account snapshot
- updating heartbeat timestamps
- preserving recent events as a bounded ring buffer
- resetting from a busy phase back to idle

**Step 2: Run test to verify it fails**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/runtime_status_store.test.js`
Expected: FAIL because `tools/lib/runtime_status_store.js` does not exist yet.

**Step 3: Write minimal implementation**

Implement a helper that:
- writes JSON to `.runtime/feishu/status/<account>.json`
- records lifecycle, phase, subject label, task summary, timestamps, and recent events
- exposes `markIdle`, `markBusy`, `markError`, `heartbeat`, and `recordReply`

**Step 4: Run the focused test**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/runtime_status_store.test.js`
Expected: PASS

### Task 2: Instrument the bot runtime

**Files:**
- Modify: `tools/feishu_ws_bot.js`
- Test: `test/runtime_status_store.test.js`

**Step 1: Wire state updates into startup and idle**

Update the bot to:
- create a store for each account on boot
- record booting state
- transition to idle after WebSocket startup
- keep a heartbeat timer while the process is alive

**Step 2: Wire state updates into task processing**

Update key runtime stages:
- incoming message accepted
- download file/image/audio start and finish
- audio transcription start and finish
- Codex execution start and progress updates
- progress document writes
- reply success, cancellation, and failure

Use truthful labels such as:
- `正在下载文件`
- `正在下载图片`
- `正在语音转写`
- `Codex 执行中`

Also include the best available object label and task summary.

**Step 3: Run targeted regressions**

Run:
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/runtime_status_store.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/referenced_message_context.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/message_actionability.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/mention_carry.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/task_queue.test.js`

Expected: PASS

### Task 3: Add health derivation and snapshot aggregation

**Files:**
- Create: `tools/lib/monitor_snapshot.js`
- Create: `test/monitor_snapshot.test.js`

**Step 1: Write the failing test**

Cover:
- `online` when process exists and heartbeat is fresh
- `stuck` when phase duration exceeds threshold
- `offline` when process is missing
- duration formatting and account sorting

**Step 2: Run test to verify it fails**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/monitor_snapshot.test.js`
Expected: FAIL because `tools/lib/monitor_snapshot.js` does not exist yet.

**Step 3: Write minimal implementation**

Implement helpers that:
- read `.runtime/feishu/status/*.json`
- cross-check matching bot PIDs
- derive `online`, `stuck`, `offline`, or `unknown`
- expose a payload ready for the dashboard API

**Step 4: Run focused tests**

Run:
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/monitor_snapshot.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/runtime_status_store.test.js`

Expected: PASS

### Task 4: Build the local monitor server and dashboard page

**Files:**
- Create: `tools/feishu_monitor_server.js`
- Modify: `package.json`

**Step 1: Implement the HTTP server**

Add routes:
- `GET /`
- `GET /api/status`
- `GET /healthz`

Bind to `127.0.0.1` by default and serve a no-build HTML page with inline CSS and client-side polling.

**Step 2: Implement the UI**

Render:
- overall counts for online, stuck, offline
- one card per account
- current stage, object, waited time
- PID, last heartbeat, task summary
- last reply and last error
- recent event list

**Step 3: Add npm scripts**

Add at least:
- `feishu:monitor`
- `feishu:monitor:status` only if a simple smoke mode is useful

**Step 4: Smoke-test the server**

Run:
- `node /Users/procmeans/Documents/SunCodexClaw/tools/feishu_monitor_server.js`
- `curl http://127.0.0.1:3977/healthz`
- `curl http://127.0.0.1:3977/api/status`

Expected:
- health endpoint returns ok
- status endpoint returns JSON with both accounts

### Task 5: Document local usage and verify end-to-end

**Files:**
- Modify: `README.md`

**Step 1: Document how to start the panel**

Add:
- start command
- local URL
- meaning of `在线 / 疑似卡死 / 离线`
- how waited time is computed

**Step 2: Run final verification**

Run:
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/runtime_status_store.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/monitor_snapshot.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/referenced_message_context.test.js`
- `node /Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js --account default --dry-run`
- `node /Users/procmeans/Documents/SunCodexClaw/tools/feishu_monitor_server.js`

Expected:
- tests pass
- bot dry-run still passes
- monitor server starts cleanly and returns local status
