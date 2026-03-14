const fs = require('fs');
const path = require('path');

const DEFAULT_STATUS_DIR = path.resolve(__dirname, '..', '..', '.runtime', 'feishu', 'status');
const DEFAULT_RECENT_EVENT_LIMIT = 20;

function toIsoString(value) {
  return new Date(value).toISOString();
}

function sanitizeAccountName(account) {
  const raw = String(account || '').trim();
  if (!raw) throw new Error('account is required');
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeCurrentTask(currentTask, taskSummary) {
  if (currentTask && typeof currentTask === 'object' && !Array.isArray(currentTask)) {
    const nextTask = cloneSerializable(currentTask);
    if (!nextTask.summary && taskSummary) nextTask.summary = taskSummary;
    return nextTask;
  }
  if (!taskSummary) return null;
  return { summary: String(taskSummary) };
}

function writeSnapshot(filePath, snapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function createRuntimeStatusStore(options = {}) {
  const account = sanitizeAccountName(options.account);
  const statusDir = path.resolve(options.statusDir || DEFAULT_STATUS_DIR);
  const filePath = path.join(statusDir, `${account}.json`);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const maxRecentEvents = Number.isInteger(options.maxRecentEvents) && options.maxRecentEvents > 0
    ? options.maxRecentEvents
    : DEFAULT_RECENT_EVENT_LIMIT;

  const initialTimestamp = now();
  const initialIso = toIsoString(initialTimestamp);
  const state = {
    account,
    pid: Number.isInteger(options.pid) ? options.pid : process.pid,
    startedAt: initialIso,
    updatedAt: initialIso,
    lastHeartbeatAt: initialIso,
    lifecycle: 'booting',
    phase: 'booting',
    phaseLabel: '启动中',
    subjectLabel: '',
    phaseStartedAt: initialIso,
    taskSummary: '',
    currentTask: null,
    lastReplyAt: '',
    lastReplySummary: '',
    lastError: null,
    recentEvents: [],
  };

  function persistEvent(type, timestamp, updates = {}) {
    const at = toIsoString(timestamp);
    Object.assign(state, updates, {
      updatedAt: at,
      lastHeartbeatAt: at,
    });
    state.recentEvents = [
      ...state.recentEvents,
      {
        at,
        type,
        lifecycle: state.lifecycle,
        phase: state.phase,
        phaseLabel: state.phaseLabel,
        subjectLabel: state.subjectLabel,
        taskSummary: state.taskSummary,
      },
    ].slice(-maxRecentEvents);
    writeSnapshot(filePath, state);
    return cloneSerializable(state);
  }

  function persistHeartbeat(timestamp) {
    const at = toIsoString(timestamp);
    state.updatedAt = at;
    state.lastHeartbeatAt = at;
    writeSnapshot(filePath, state);
    return cloneSerializable(state);
  }

  persistEvent('booting', initialTimestamp);

  return {
    filePath,
    getSnapshot() {
      return cloneSerializable(state);
    },
    heartbeat() {
      return persistHeartbeat(now());
    },
    markIdle() {
      const timestamp = now();
      return persistEvent('idle', timestamp, {
        lifecycle: 'idle',
        phase: 'idle',
        phaseLabel: '空闲等待',
        subjectLabel: '',
        phaseStartedAt: toIsoString(timestamp),
        taskSummary: '',
        currentTask: null,
      });
    },
    markBusy(details = {}) {
      const timestamp = now();
      const phase = String(details.phase || '').trim() || 'busy';
      const phaseLabel = String(details.phaseLabel || '').trim() || '处理中';
      const subjectLabel = String(details.subjectLabel || '').trim();
      const taskSummary = String(details.taskSummary || details.currentTask?.summary || '').trim();
      return persistEvent('busy', timestamp, {
        lifecycle: 'busy',
        phase,
        phaseLabel,
        subjectLabel,
        phaseStartedAt: toIsoString(timestamp),
        taskSummary,
        currentTask: normalizeCurrentTask(details.currentTask, taskSummary),
      });
    },
    markError(error, details = {}) {
      const timestamp = now();
      const message = String(
        details.message
        || error?.message
        || error
        || 'unknown error'
      ).trim() || 'unknown error';
      const at = toIsoString(timestamp);
      const phase = String(details.phase || state.phase || 'error').trim() || 'error';
      const phaseLabel = String(details.phaseLabel || state.phaseLabel || '处理失败').trim() || '处理失败';
      const subjectLabel = String(
        details.subjectLabel !== undefined ? details.subjectLabel : state.subjectLabel
      ).trim();
      const taskSummary = String(details.taskSummary || state.taskSummary || '').trim();
      return persistEvent('error', timestamp, {
        lifecycle: 'error',
        phase,
        phaseLabel,
        subjectLabel,
        taskSummary,
        currentTask: normalizeCurrentTask(details.currentTask !== undefined ? details.currentTask : state.currentTask, taskSummary),
        lastError: {
          at,
          message,
        },
      });
    },
    recordReply(summary) {
      const timestamp = now();
      const nextSummary = String(summary || '').trim();
      return persistEvent('reply', timestamp, {
        lastReplyAt: toIsoString(timestamp),
        lastReplySummary: nextSummary,
      });
    },
  };
}

module.exports = {
  DEFAULT_STATUS_DIR,
  createRuntimeStatusStore,
  sanitizeAccountName,
};
