const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectMonitorSnapshot,
  formatMonitorDuration,
} = require('../tools/lib/monitor_snapshot');

function writeSnapshot(statusDir, account, snapshot) {
  fs.mkdirSync(statusDir, { recursive: true });
  fs.writeFileSync(
    path.join(statusDir, `${account}.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8'
  );
}

test('collectMonitorSnapshot marks an account online when the process exists and heartbeat is fresh', () => {
  const statusDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-snapshot-'));
  const now = Date.parse('2026-03-12T12:00:00.000Z');
  writeSnapshot(statusDir, 'default', {
    account: 'default',
    pid: 111,
    lifecycle: 'busy',
    phase: 'download_file',
    phaseLabel: '正在下载文件',
    subjectLabel: '需求文档.pdf',
    phaseStartedAt: '2026-03-12T11:59:40.000Z',
    lastHeartbeatAt: '2026-03-12T11:59:56.000Z',
    taskSummary: '下载并读取需求文档',
    recentEvents: [],
  });

  const payload = collectMonitorSnapshot({
    statusDir,
    now,
    processChecker({ account, pid }) {
      return account === 'default' && pid === 111;
    },
  });

  assert.equal(payload.summary.online, 1);
  assert.equal(payload.accounts[0].account, 'default');
  assert.equal(payload.accounts[0].health, 'online');
  assert.equal(payload.accounts[0].waitedMs, 20_000);
  assert.equal(payload.accounts[0].waitedText, '20 秒');
});

test('collectMonitorSnapshot marks an account stuck when the phase duration exceeds its threshold', () => {
  const statusDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-snapshot-'));
  const now = Date.parse('2026-03-12T12:00:00.000Z');
  writeSnapshot(statusDir, 'default', {
    account: 'default',
    pid: 222,
    lifecycle: 'busy',
    phase: 'codex_exec',
    phaseLabel: 'Codex 执行中',
    subjectLabel: '开始分析消息',
    phaseStartedAt: '2026-03-12T11:54:30.000Z',
    lastHeartbeatAt: '2026-03-12T11:59:58.000Z',
    taskSummary: '处理用户提问',
    recentEvents: [],
  });

  const payload = collectMonitorSnapshot({
    statusDir,
    now,
    processChecker() {
      return true;
    },
  });

  assert.equal(payload.summary.stuck, 1);
  assert.equal(payload.accounts[0].health, 'stuck');
  assert.match(payload.accounts[0].statusReason, /phase threshold/i);
});

test('collectMonitorSnapshot marks an account offline when the process is missing', () => {
  const statusDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-snapshot-'));
  const now = Date.parse('2026-03-12T12:00:00.000Z');
  writeSnapshot(statusDir, 'second', {
    account: 'second',
    pid: 333,
    lifecycle: 'idle',
    phase: 'idle',
    phaseLabel: '空闲等待',
    subjectLabel: '',
    phaseStartedAt: '2026-03-12T11:58:00.000Z',
    lastHeartbeatAt: '2026-03-12T11:59:55.000Z',
    taskSummary: '',
    recentEvents: [],
  });

  const payload = collectMonitorSnapshot({
    statusDir,
    now,
    processChecker() {
      return false;
    },
  });

  assert.equal(payload.summary.offline, 1);
  assert.equal(payload.accounts[0].health, 'offline');
  assert.equal(payload.accounts[0].processAlive, false);
});

test('collectMonitorSnapshot sorts accounts and formatMonitorDuration renders minute-second text', () => {
  const statusDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-snapshot-'));
  const now = Date.parse('2026-03-12T12:00:00.000Z');
  writeSnapshot(statusDir, 'second', {
    account: 'second',
    pid: 444,
    lifecycle: 'idle',
    phase: 'idle',
    phaseLabel: '空闲等待',
    subjectLabel: '',
    phaseStartedAt: '2026-03-12T11:58:55.000Z',
    lastHeartbeatAt: '2026-03-12T11:59:58.000Z',
    taskSummary: '',
    recentEvents: [],
  });
  writeSnapshot(statusDir, 'default', {
    account: 'default',
    pid: 555,
    lifecycle: 'idle',
    phase: 'idle',
    phaseLabel: '空闲等待',
    subjectLabel: '',
    phaseStartedAt: '2026-03-12T11:58:00.000Z',
    lastHeartbeatAt: '2026-03-12T11:59:58.000Z',
    taskSummary: '',
    recentEvents: [],
  });

  const payload = collectMonitorSnapshot({
    statusDir,
    accounts: ['second', 'default'],
    now,
    processChecker() {
      return true;
    },
  });

  assert.deepEqual(
    payload.accounts.map((account) => account.account),
    ['default', 'second']
  );
  assert.equal(formatMonitorDuration(65_000), '1 分 05 秒');
});
