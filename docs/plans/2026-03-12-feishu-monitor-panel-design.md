# Feishu Bot Monitor Panel Design

## Goal

Add a local-only read-only web panel so the operator can quickly tell:

- whether each bot process is alive
- whether a bot is idle, working, or likely stuck
- what stage the bot is currently in
- what object the bot is waiting on
- how long the bot has been waiting in that stage

## Current Project Context

- The repo already has detached bot runtime scripts and launchagent support.
- The bot already emits useful log lines and progress updates, but they are optimized for logs and Feishu messages, not for a machine-readable dashboard.
- The project has no web framework or frontend build pipeline, so the monitor should avoid adding one.
- The operator only needs local access for now, so the panel can safely bind to `127.0.0.1` and skip auth in the first version.

## Scope

### In Scope

- A local HTTP server that serves one read-only dashboard page
- Per-account health and task state for `default` and `second`
- Stage-level status with object labels and elapsed waiting time
- Detection of likely stuck states based on stale heartbeats and per-stage thresholds
- Recent events and last error summaries

### Out of Scope

- Remote access from other devices
- Any control actions such as restart, stop, or send test message
- A full historical timeline database
- Editing config from the panel

## Recommended Architecture

Use a small structure-first design:

1. The bot runtime writes structured state snapshots to disk under `.runtime/feishu/status/<account>.json`.
2. A local Node HTTP server reads those snapshots, cross-checks the process state, and derives a higher-level health summary.
3. A minimal HTML page polls a JSON API every few seconds and renders status cards for each bot.

This keeps the bot runtime and monitor loosely coupled. If the monitor server is down, the bots keep working. If a bot is down, the monitor can still show the last known state.

## State Model

Each account snapshot should include:

- `account`
- `pid`
- `startedAt`
- `lastHeartbeatAt`
- `lifecycle`
  - `booting`
  - `idle`
  - `busy`
  - `error`
- `phase`
  - stable machine-readable phase code such as `download_file`, `download_image`, `download_audio`, `transcribe_audio`, `codex_exec`, `progress_doc_write`, `reply_send`
- `phaseLabel`
  - user-facing text such as `正在下载文件`
- `subjectLabel`
  - concrete object name such as `需求文档.pdf`, `第 2/5 张图片`, `voice-123.opus`, `Codex 任务进度 2026-03-12 15:00`
- `phaseStartedAt`
- `currentTask`
  - compact task summary, message id, chat id, sender id
- `lastReplyAt`
- `lastReplySummary`
- `lastError`
- `recentEvents`
  - short ring buffer for recent state transitions

The panel will compute `elapsedMs` from `phaseStartedAt`, so the UI can show “已等待 18 秒” live without forcing the bot to constantly rewrite the exact duration text.

## Runtime Instrumentation

The bot should emit state updates at these boundaries:

- startup complete
- idle waiting for next message
- incoming message accepted for processing
- referenced message fetch
- file download start and finish
- image download start and finish
- audio download start and finish
- audio transcription start and finish
- Codex execution start and progress event updates
- progress document creation and append
- reply send start and finish
- failure and cancellation

For the stages the user explicitly cares about, the state must include both object label and wait duration:

- `正在下载文件：<fileName>`
- `正在下载图片：第 X/Y 张`
- `正在下载语音：<localName>`
- `正在语音转写：<fileName>`
- `正在写入进度文档：<docTitle or documentID>`

For Codex-internal network activity, the panel should show the best available stage summary from existing progress events. If the runtime cannot know the specific remote object, it should display a generic but truthful label such as `Codex 执行中`.

## Health Derivation

The monitor server should combine snapshot freshness and real process existence:

- `offline`
  - PID missing or no matching bot process
- `online`
  - process exists and heartbeat is within threshold
- `stuck`
  - process exists but the active phase has exceeded its threshold or the heartbeat is stale
- `unknown`
  - no process and no usable snapshot yet

Initial thresholds:

- `download_file`: 60 seconds
- `download_image`: 60 seconds
- `download_audio`: 60 seconds
- `transcribe_audio`: 120 seconds
- `progress_doc_write`: 90 seconds
- `codex_exec`: 300 seconds
- idle heartbeat freshness: 10 seconds normal, 30 seconds stale

## Local HTTP Service

Add a small Node server with:

- `GET /`
  - returns the monitor HTML page
- `GET /api/status`
  - returns all account snapshots plus derived health
- `GET /healthz`
  - returns a minimal ok response for local smoke checks

The server should bind to `127.0.0.1` by default and use a simple configurable port. No extra npm dependency is needed; built-in `http`, `fs`, and `path` are enough.

## UI Design

The page should be intentionally simple and operational:

- one summary header showing how many bots are online, stuck, or offline
- one card per bot account
- strong status chips for `在线`, `疑似卡死`, `离线`
- clearly separated current stage block:
  - phase label
  - object label
  - elapsed waiting time
- supporting metadata:
  - PID
  - last heartbeat
  - current task summary
  - last successful reply
  - last error
- a compact recent events list under each card

The page should poll every 2 to 3 seconds instead of using WebSockets, because the dashboard is local-only and polling keeps the implementation small.

## Error Handling

- If a snapshot file is missing, show “暂无状态数据” instead of throwing.
- If a snapshot file is corrupt, mark that account as degraded and surface the parse error in the recent events block.
- If the process exists but the snapshot is stale, report `疑似卡死` rather than pretending the bot is healthy.
- If the bot fails before writing any state file, the monitor can still infer `offline` from process absence.

## Security and Operational Constraints

- Bind only to `127.0.0.1` in the first version.
- Do not expose any write endpoint.
- Keep all data on local disk under the existing `.runtime/feishu` tree.
- Avoid additional dependencies and build steps.

## Testing Strategy

- Unit test the status store helper
- Unit test health derivation from synthetic snapshots
- Unit test API response shaping
- Smoke-test the HTTP server locally with `curl`
- Verify the bot updates the status snapshot during real stages such as startup, idle, and a staged fake workload
