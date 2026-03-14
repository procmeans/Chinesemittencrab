const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_STATUS_DIR = path.resolve(__dirname, '..', '..', '.runtime', 'feishu', 'status');
const HEARTBEAT_STALE_MS = 30_000;
const PHASE_STUCK_THRESHOLD_MS = {
  download_file: 60_000,
  download_image: 60_000,
  download_audio: 60_000,
  transcribe_audio: 120_000,
  progress_doc_write: 90_000,
  codex_exec: 300_000,
};

function formatMonitorDuration(durationMs) {
  const totalMs = Math.max(0, Number(durationMs) || 0);
  const totalSeconds = Math.floor(totalMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours} 小时 ${String(minutes).padStart(2, '0')} 分`;
  }
  return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
}

function parseTimestamp(value) {
  const time = Date.parse(String(value || '').trim());
  return Number.isFinite(time) ? time : null;
}

function uniqueAccounts(accounts = []) {
  return Array.from(
    new Set(
      (Array.isArray(accounts) ? accounts : [])
        .map((account) => String(account || '').trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function readStatusEntries(statusDir = DEFAULT_STATUS_DIR) {
  const root = path.resolve(statusDir);
  if (!fs.existsSync(root)) return new Map();

  const entries = new Map();
  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isFile() || path.extname(dirent.name) !== '.json') continue;
    const filePath = path.join(root, dirent.name);
    const fallbackAccount = path.basename(dirent.name, '.json');
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('snapshot root must be an object');
      }
      const account = String(parsed.account || fallbackAccount).trim() || fallbackAccount;
      entries.set(account, {
        account,
        snapshot: parsed,
        filePath,
        error: '',
      });
    } catch (error) {
      entries.set(fallbackAccount, {
        account: fallbackAccount,
        snapshot: null,
        filePath,
        error: error.message,
      });
    }
  }
  return entries;
}

function defaultProcessChecker({ account, pid }) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return false;
  const command = String(result.stdout || '').trim();
  return command.includes(`feishu_ws_bot.js --account ${account}`);
}

function deriveHealth({ snapshot, processAlive, now }) {
  if (!snapshot) {
    return {
      health: processAlive ? 'unknown' : 'unknown',
      statusReason: processAlive ? 'process has no snapshot yet' : 'missing snapshot and process',
    };
  }
  if (!processAlive) {
    return {
      health: 'offline',
      statusReason: 'matching process not found',
    };
  }

  const heartbeatAt = parseTimestamp(snapshot.lastHeartbeatAt);
  const heartbeatAgeMs = heartbeatAt === null ? null : Math.max(0, now - heartbeatAt);
  if (heartbeatAgeMs !== null && heartbeatAgeMs > HEARTBEAT_STALE_MS) {
    return {
      health: 'stuck',
      statusReason: 'heartbeat stale',
    };
  }

  const phase = String(snapshot.phase || '').trim();
  const phaseStartedAt = parseTimestamp(snapshot.phaseStartedAt);
  const waitedMs = phaseStartedAt === null ? 0 : Math.max(0, now - phaseStartedAt);
  const thresholdMs = PHASE_STUCK_THRESHOLD_MS[phase] || 0;
  if (thresholdMs > 0 && waitedMs > thresholdMs) {
    return {
      health: 'stuck',
      statusReason: `phase threshold exceeded (${phase})`,
    };
  }

  if (String(snapshot.lifecycle || '').trim() === 'error') {
    return {
      health: 'stuck',
      statusReason: 'runtime entered error lifecycle',
    };
  }

  return {
    health: 'online',
    statusReason: 'process alive and heartbeat fresh',
  };
}

function collectMonitorSnapshot(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const statusDir = options.statusDir || DEFAULT_STATUS_DIR;
  const processChecker = typeof options.processChecker === 'function'
    ? options.processChecker
    : defaultProcessChecker;
  const entryMap = readStatusEntries(statusDir);
  const accounts = uniqueAccounts([
    ...entryMap.keys(),
    ...(Array.isArray(options.accounts) ? options.accounts : []),
  ]);

  const items = accounts.map((account) => {
    const entry = entryMap.get(account) || {
      account,
      snapshot: null,
      filePath: path.join(path.resolve(statusDir), `${account}.json`),
      error: '',
    };
    const snapshot = entry.snapshot;
    const pid = Number.parseInt(String(snapshot?.pid || ''), 10);
    const normalizedPid = Number.isInteger(pid) ? pid : 0;
    const processAlive = Boolean(
      processChecker({
        account,
        pid: normalizedPid,
        snapshot,
      })
    );
    const phaseStartedAt = parseTimestamp(snapshot?.phaseStartedAt);
    const lastHeartbeatAt = parseTimestamp(snapshot?.lastHeartbeatAt);
    const waitedMs = phaseStartedAt === null ? 0 : Math.max(0, now - phaseStartedAt);
    const heartbeatAgeMs = lastHeartbeatAt === null ? null : Math.max(0, now - lastHeartbeatAt);
    const derived = deriveHealth({
      snapshot,
      processAlive,
      now,
    });

    return {
      account,
      filePath: entry.filePath,
      health: derived.health,
      statusReason: derived.statusReason,
      processAlive,
      pid: normalizedPid || 0,
      lifecycle: String(snapshot?.lifecycle || '').trim(),
      phase: String(snapshot?.phase || '').trim(),
      phaseLabel: String(snapshot?.phaseLabel || '').trim(),
      subjectLabel: String(snapshot?.subjectLabel || '').trim(),
      taskSummary: String(snapshot?.taskSummary || snapshot?.currentTask?.summary || '').trim(),
      currentTask: snapshot?.currentTask || null,
      startedAt: String(snapshot?.startedAt || '').trim(),
      phaseStartedAt: String(snapshot?.phaseStartedAt || '').trim(),
      lastHeartbeatAt: String(snapshot?.lastHeartbeatAt || '').trim(),
      heartbeatAgeMs,
      heartbeatAgeText: heartbeatAgeMs === null ? '' : formatMonitorDuration(heartbeatAgeMs),
      waitedMs,
      waitedText: formatMonitorDuration(waitedMs),
      lastReplyAt: String(snapshot?.lastReplyAt || '').trim(),
      lastReplySummary: String(snapshot?.lastReplySummary || '').trim(),
      lastError: snapshot?.lastError || null,
      recentEvents: Array.isArray(snapshot?.recentEvents) ? snapshot.recentEvents : [],
      snapshotError: entry.error || '',
    };
  });

  const summary = {
    total: items.length,
    online: items.filter((item) => item.health === 'online').length,
    stuck: items.filter((item) => item.health === 'stuck').length,
    offline: items.filter((item) => item.health === 'offline').length,
    unknown: items.filter((item) => item.health === 'unknown').length,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    statusDir: path.resolve(statusDir),
    summary,
    accounts: items,
  };
}

module.exports = {
  DEFAULT_STATUS_DIR,
  HEARTBEAT_STALE_MS,
  PHASE_STUCK_THRESHOLD_MS,
  collectMonitorSnapshot,
  defaultProcessChecker,
  formatMonitorDuration,
  readStatusEntries,
};
