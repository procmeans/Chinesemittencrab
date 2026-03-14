#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { collectMonitorSnapshot, DEFAULT_STATUS_DIR } = require('./lib/monitor_snapshot');
const { listConfigEntryNames } = require('./lib/local_secret_store');

const DEFAULT_MONITOR_HOST = '127.0.0.1';
const DEFAULT_MONITOR_PORT = 3977;
const DEFAULT_REFRESH_MS = 2500;
const DEFAULT_CONFIG_DIR = path.resolve(__dirname, '..', 'config', 'feishu');

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return fallback;
}

function asPort(value, fallback = DEFAULT_MONITOR_PORT) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}

function listFeishuAccounts(options = {}) {
  const configDir = path.resolve(options.configDir || DEFAULT_CONFIG_DIR);
  const accounts = new Set(['default']);

  if (fs.existsSync(configDir)) {
    for (const dirent of fs.readdirSync(configDir, { withFileTypes: true })) {
      if (!dirent.isFile() || path.extname(dirent.name) !== '.json') continue;
      if (dirent.name.endsWith('.example.json')) continue;
      accounts.add(path.basename(dirent.name, '.json'));
    }
  }

  for (const name of listConfigEntryNames('feishu')) {
    accounts.add(name);
  }

  return Array.from(accounts)
    .map((account) => String(account || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function defaultSnapshotProvider(options = {}) {
  const statusDir = options.statusDir || DEFAULT_STATUS_DIR;
  const configDir = options.configDir || DEFAULT_CONFIG_DIR;
  return collectMonitorSnapshot({
    statusDir,
    accounts: listFeishuAccounts({ configDir }),
  });
}

function renderDashboardHtml(options = {}) {
  const refreshMs = Math.max(1000, Number(options.refreshMs) || DEFAULT_REFRESH_MS);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Feishu Bot Monitor</title>
  <style>
    :root {
      --bg: #f4efe4;
      --bg-accent: #e4efe6;
      --ink: #1e2a28;
      --muted: #596967;
      --card: rgba(255, 252, 246, 0.9);
      --line: rgba(30, 42, 40, 0.12);
      --online: #1d7a51;
      --stuck: #b15b18;
      --offline: #8a4f57;
      --unknown: #6b7280;
      --shadow: 0 16px 40px rgba(54, 63, 58, 0.1);
      --radius: 24px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "IBM Plex Sans", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(230, 183, 130, 0.35), transparent 32%),
        radial-gradient(circle at top right, rgba(103, 158, 128, 0.22), transparent 28%),
        linear-gradient(160deg, var(--bg), var(--bg-accent));
      min-height: 100vh;
    }

    .shell {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 18px 56px;
    }

    .hero {
      display: grid;
      gap: 18px;
      grid-template-columns: 1.3fr 1fr;
      align-items: stretch;
      margin-bottom: 22px;
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .hero-copy {
      padding: 24px;
      position: relative;
      overflow: hidden;
    }

    .hero-copy::after {
      content: "";
      position: absolute;
      width: 160px;
      height: 160px;
      right: -36px;
      bottom: -64px;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(29, 122, 81, 0.18), rgba(29, 122, 81, 0));
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .eyebrow::before {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, #1d7a51, #d1a365);
    }

    h1 {
      margin: 14px 0 10px;
      font-size: clamp(28px, 4vw, 42px);
      line-height: 1.02;
      letter-spacing: -0.04em;
    }

    .hero-copy p,
    .meta,
    .muted,
    .event-time {
      color: var(--muted);
    }

    .hero-copy p {
      margin: 0;
      max-width: 48ch;
      line-height: 1.6;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      padding: 18px;
    }

    .summary-card {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.55);
    }

    .summary-card strong {
      display: block;
      font-size: 28px;
      margin-top: 6px;
    }

    .legend {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
      font-size: 13px;
    }

    .legend span,
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 7px 12px;
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.78);
    }

    .chip-online,
    .legend .online::before { color: var(--online); }
    .chip-stuck,
    .legend .stuck::before { color: var(--stuck); }
    .chip-offline,
    .legend .offline::before { color: var(--offline); }
    .chip-unknown,
    .legend .unknown::before { color: var(--unknown); }

    .legend span::before {
      content: "●";
      font-size: 10px;
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin: 18px 0 14px;
      font-size: 14px;
    }

    .accounts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 16px;
    }

    .account-card {
      padding: 20px;
      display: grid;
      gap: 14px;
      animation: rise 280ms ease-out;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .account-header,
    .detail-row,
    .event-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }

    .account-header h2 {
      margin: 0;
      font-size: 22px;
    }

    .phase-box {
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.52));
    }

    .phase-label {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .subject-label {
      font-size: 14px;
      margin-bottom: 10px;
      color: var(--muted);
      min-height: 20px;
    }

    .waited {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      letter-spacing: 0.01em;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(30, 42, 40, 0.06);
    }

    .details {
      display: grid;
      gap: 10px;
    }

    .detail-grid {
      display: grid;
      gap: 10px;
    }

    .detail-row {
      border-bottom: 1px dashed rgba(30, 42, 40, 0.08);
      padding-bottom: 10px;
    }

    .detail-row:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .detail-label {
      font-size: 12px;
      color: var(--muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      min-width: 88px;
    }

    .detail-value {
      text-align: right;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .events {
      border-top: 1px solid var(--line);
      padding-top: 14px;
    }

    .events h3 {
      margin: 0 0 10px;
      font-size: 14px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .event-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .event-row {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid rgba(30, 42, 40, 0.08);
    }

    .empty {
      padding: 28px;
      text-align: center;
      color: var(--muted);
    }

    @media (max-width: 900px) {
      .hero {
        grid-template-columns: 1fr;
      }

      .toolbar,
      .account-header,
      .detail-row,
      .event-row {
        flex-direction: column;
        align-items: flex-start;
      }

      .detail-value {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="panel hero-copy">
        <div class="eyebrow">Local Monitor</div>
        <h1>Feishu 机器人监控面板</h1>
        <p>本机只读面板，轮询展示每个机器人当前阶段、等待时长、最新心跳和最近事件。状态分为在线、疑似卡死、离线。</p>
        <div class="legend">
          <span class="online">在线</span>
          <span class="stuck">疑似卡死</span>
          <span class="offline">离线</span>
          <span class="unknown">未知</span>
        </div>
      </div>
      <div class="panel summary-grid" id="summary-grid">
        <div class="summary-card"><div>总账号数</div><strong id="summary-total">0</strong></div>
        <div class="summary-card"><div>在线</div><strong id="summary-online">0</strong></div>
        <div class="summary-card"><div>疑似卡死</div><strong id="summary-stuck">0</strong></div>
        <div class="summary-card"><div>离线</div><strong id="summary-offline">0</strong></div>
      </div>
    </section>

    <div class="toolbar">
      <div class="meta">本地地址：<code>/api/status</code> 每 ${Math.round(refreshMs / 1000)} 秒刷新一次</div>
      <div class="meta" id="updated-at">等待首次加载…</div>
    </div>

    <section class="accounts" id="account-list">
      <div class="panel empty">等待状态数据…</div>
    </section>
  </div>

  <script>
    const REFRESH_MS = ${refreshMs};
    const statusLabel = {
      online: '在线',
      stuck: '疑似卡死',
      offline: '离线',
      unknown: '未知',
    };

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderSummary(payload) {
      const summary = payload?.summary || {};
      document.getElementById('summary-total').textContent = String(summary.total || 0);
      document.getElementById('summary-online').textContent = String(summary.online || 0);
      document.getElementById('summary-stuck').textContent = String(summary.stuck || 0);
      document.getElementById('summary-offline').textContent = String(summary.offline || 0);
      document.getElementById('updated-at').textContent = payload?.generatedAt
        ? '最近刷新：' + new Date(payload.generatedAt).toLocaleString()
        : '暂无刷新时间';
    }

    function renderEvent(event) {
      const label = escapeHtml(event?.phaseLabel || event?.type || '状态更新');
      const meta = escapeHtml(event?.subjectLabel || event?.taskSummary || '');
      const at = event?.at ? new Date(event.at).toLocaleTimeString() : '';
      return '<li class="event-row"><div><strong>' + label + '</strong>' + (meta ? '<div class="muted">' + meta + '</div>' : '') + '</div><div class="event-time">' + escapeHtml(at) + '</div></li>';
    }

    function renderAccountCard(account) {
      const chipClass = 'chip chip-' + escapeHtml(account.health || 'unknown');
      const lastError = account?.lastError?.message ? escapeHtml(account.lastError.message) : '无';
      const lastReply = account?.lastReplySummary ? escapeHtml(account.lastReplySummary) : '暂无';
      const taskSummary = account?.taskSummary ? escapeHtml(account.taskSummary) : '暂无任务';
      const subject = account?.subjectLabel ? escapeHtml(account.subjectLabel) : '暂无对象标签';
      const phaseLabel = escapeHtml(account?.phaseLabel || '暂无状态数据');
      const events = Array.isArray(account?.recentEvents) && account.recentEvents.length > 0
        ? account.recentEvents.slice().reverse().slice(0, 6).map(renderEvent).join('')
        : '<li class="event-row"><div class="muted">暂无 recent events</div></li>';
      return [
        '<article class="panel account-card">',
        '<div class="account-header">',
        '<div><h2>' + escapeHtml(account.account || 'unknown') + '</h2><div class="muted">' + escapeHtml(account.statusReason || '') + '</div></div>',
        '<span class="' + chipClass + '">' + escapeHtml(statusLabel[account.health] || '未知') + '</span>',
        '</div>',
        '<div class="phase-box">',
        '<div class="phase-label">' + phaseLabel + '</div>',
        '<div class="subject-label">' + subject + '</div>',
        '<div class="waited">已等待 ' + escapeHtml(account?.waitedText || '0 秒') + '</div>',
        '</div>',
        '<div class="details detail-grid">',
        '<div class="detail-row"><div class="detail-label">任务摘要</div><div class="detail-value">' + taskSummary + '</div></div>',
        '<div class="detail-row"><div class="detail-label">PID</div><div class="detail-value">' + escapeHtml(account?.pid || '(none)') + '</div></div>',
        '<div class="detail-row"><div class="detail-label">最近心跳</div><div class="detail-value">' + escapeHtml(account?.lastHeartbeatAt || '暂无') + '</div></div>',
        '<div class="detail-row"><div class="detail-label">最近回复</div><div class="detail-value">' + lastReply + '</div></div>',
        '<div class="detail-row"><div class="detail-label">最近错误</div><div class="detail-value">' + lastError + '</div></div>',
        '</div>',
        '<div class="events"><h3>Recent Events</h3><ul class="event-list">' + events + '</ul></div>',
        '</article>',
      ].join('');
    }

    function renderAccounts(payload) {
      const mount = document.getElementById('account-list');
      const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
      if (accounts.length === 0) {
        mount.innerHTML = '<div class="panel empty">暂无状态数据</div>';
        return;
      }
      mount.innerHTML = accounts.map(renderAccountCard).join('');
    }

    async function refresh() {
      try {
        const response = await fetch('/api/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = await response.json();
        renderSummary(payload);
        renderAccounts(payload);
      } catch (error) {
        document.getElementById('account-list').innerHTML =
          '<div class="panel empty">状态加载失败：' + escapeHtml(error.message || 'unknown error') + '</div>';
      }
    }

    refresh();
    setInterval(refresh, REFRESH_MS);
  </script>
</body>
</html>`;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function createMonitorServer(options = {}) {
  const snapshotProvider = typeof options.snapshotProvider === 'function'
    ? options.snapshotProvider
    : () => defaultSnapshotProvider(options);
  const refreshMs = Math.max(1000, Number(options.refreshMs) || DEFAULT_REFRESH_MS);

  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');

    if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('ok');
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/status') {
      try {
        sendJson(response, 200, snapshotProvider());
      } catch (error) {
        sendJson(response, 500, {
          error: error.message,
        });
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(renderDashboardHtml({ refreshMs }));
      return;
    }

    response.writeHead(404, {
      'content-type': 'text/plain; charset=utf-8',
    });
    response.end('not found');
  });
}

function startMonitorServer(options = {}) {
  const host = String(options.host || DEFAULT_MONITOR_HOST).trim() || DEFAULT_MONITOR_HOST;
  const port = asPort(options.port, DEFAULT_MONITOR_PORT);
  const server = createMonitorServer({
    ...options,
    host,
    port,
  });

  server.listen(port, host, () => {
    console.log(`FEISHU_MONITOR_SERVER_RUNNING host=${host} port=${port}`);
    console.log(`url=http://${host}:${port}/`);
  });

  return server;
}

if (require.main === module) {
  const host = getArg('--host', process.env.FEISHU_MONITOR_HOST || DEFAULT_MONITOR_HOST);
  const port = asPort(getArg('--port', process.env.FEISHU_MONITOR_PORT || DEFAULT_MONITOR_PORT), DEFAULT_MONITOR_PORT);
  const statusDir = getArg('--status-dir', process.env.FEISHU_MONITOR_STATUS_DIR || DEFAULT_STATUS_DIR);
  const configDir = getArg('--config-dir', process.env.FEISHU_MONITOR_CONFIG_DIR || DEFAULT_CONFIG_DIR);
  const printStatus = process.argv.includes('--print-status');

  if (printStatus) {
    const payload = defaultSnapshotProvider({ statusDir, configDir });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    startMonitorServer({ host, port, statusDir, configDir });
  }
}

module.exports = {
  DEFAULT_CONFIG_DIR,
  DEFAULT_MONITOR_HOST,
  DEFAULT_MONITOR_PORT,
  DEFAULT_REFRESH_MS,
  createMonitorServer,
  defaultSnapshotProvider,
  listFeishuAccounts,
  renderDashboardHtml,
  startMonitorServer,
};
