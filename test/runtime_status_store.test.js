const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRuntimeStatusStore,
} = require('../tools/lib/runtime_status_store');

function makeNowSequence(values) {
  const queue = values.slice();
  const last = values[values.length - 1];
  return () => {
    if (queue.length > 0) return queue.shift();
    return last;
  };
}

function readSnapshot(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('createRuntimeStatusStore writes an initial per-account snapshot and updates heartbeat', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-status-store-'));
  const now = makeNowSequence([
    Date.parse('2026-03-12T10:00:00.000Z'),
    Date.parse('2026-03-12T10:00:05.000Z'),
  ]);
  const store = createRuntimeStatusStore({
    account: 'default',
    statusDir: rootDir,
    pid: 4321,
    now,
  });

  assert.equal(store.filePath, path.join(rootDir, 'default.json'));

  let snapshot = readSnapshot(store.filePath);
  assert.equal(snapshot.account, 'default');
  assert.equal(snapshot.pid, 4321);
  assert.equal(snapshot.lifecycle, 'booting');
  assert.equal(snapshot.phase, 'booting');
  assert.equal(snapshot.phaseLabel, '启动中');
  assert.equal(snapshot.startedAt, '2026-03-12T10:00:00.000Z');
  assert.equal(snapshot.lastHeartbeatAt, '2026-03-12T10:00:00.000Z');

  store.heartbeat();
  snapshot = readSnapshot(store.filePath);
  assert.equal(snapshot.lastHeartbeatAt, '2026-03-12T10:00:05.000Z');
});

test('createRuntimeStatusStore preserves bounded recent events and resets busy state to idle', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-status-store-'));
  const now = makeNowSequence([
    Date.parse('2026-03-12T10:10:00.000Z'),
    Date.parse('2026-03-12T10:10:10.000Z'),
    Date.parse('2026-03-12T10:10:20.000Z'),
    Date.parse('2026-03-12T10:10:30.000Z'),
    Date.parse('2026-03-12T10:10:40.000Z'),
    Date.parse('2026-03-12T10:10:50.000Z'),
  ]);
  const store = createRuntimeStatusStore({
    account: 'second',
    statusDir: rootDir,
    now,
    maxRecentEvents: 3,
  });

  store.markBusy({
    phase: 'download_file',
    phaseLabel: '正在下载文件',
    subjectLabel: '需求文档.pdf',
    taskSummary: '下载并读取需求文档',
    currentTask: {
      chatId: 'oc_123',
      messageId: 'om_456',
      senderId: 'ou_789',
      summary: '下载并读取需求文档',
    },
  });
  store.recordReply('已发送文档摘要');
  store.markError(new Error('下载失败'));
  store.markIdle();

  const snapshot = readSnapshot(store.filePath);
  assert.equal(snapshot.lifecycle, 'idle');
  assert.equal(snapshot.phase, 'idle');
  assert.equal(snapshot.phaseLabel, '空闲等待');
  assert.equal(snapshot.subjectLabel, '');
  assert.equal(snapshot.currentTask, null);
  assert.equal(snapshot.lastReplySummary, '已发送文档摘要');
  assert.equal(snapshot.lastReplyAt, '2026-03-12T10:10:20.000Z');
  assert.equal(snapshot.lastError.message, '下载失败');
  assert.equal(snapshot.lastError.at, '2026-03-12T10:10:30.000Z');
  assert.equal(snapshot.recentEvents.length, 3);
  assert.deepEqual(
    snapshot.recentEvents.map((event) => event.type),
    ['reply', 'error', 'idle']
  );
  assert.equal(snapshot.recentEvents[2].phaseLabel, '空闲等待');
});
