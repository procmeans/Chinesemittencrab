const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFeishuRuntimeTracker,
} = require('../tools/lib/feishu_runtime_status');

function createStoreSpy() {
  const calls = [];
  return {
    calls,
    markBusy(details) {
      calls.push({ method: 'markBusy', details });
    },
    markIdle() {
      calls.push({ method: 'markIdle' });
    },
    markError(error, details) {
      calls.push({ method: 'markError', error, details });
    },
    heartbeat() {
      calls.push({ method: 'heartbeat' });
    },
    recordReply(summary) {
      calls.push({ method: 'recordReply', summary });
    },
  };
}

test('createFeishuRuntimeTracker schedules and clears heartbeat updates', () => {
  const store = createStoreSpy();
  const timers = [];
  const cleared = [];
  const tracker = createFeishuRuntimeTracker({
    store,
    heartbeatIntervalMs: 2500,
    setIntervalFn(handler, ms) {
      timers.push({ handler, ms });
      return { id: 'heartbeat-timer' };
    },
    clearIntervalFn(timer) {
      cleared.push(timer);
    },
  });

  tracker.startHeartbeat();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 2500);

  timers[0].handler();
  assert.deepEqual(store.calls, [{ method: 'heartbeat' }]);

  tracker.stopHeartbeat();
  assert.deepEqual(cleared, [{ id: 'heartbeat-timer' }]);
});

test('createFeishuRuntimeTracker marks runtime stages with truthful labels and task metadata', () => {
  const store = createStoreSpy();
  const tracker = createFeishuRuntimeTracker({ store });
  const task = {
    chatId: 'oc_123',
    messageId: 'om_456',
    senderId: 'ou_789',
    summary: '处理用户发来的文件消息',
  };

  tracker.markMessageAccepted({ task, subjectLabel: '文件消息' });
  tracker.markDownloadFile({ task, fileName: '需求文档.pdf' });
  tracker.markDownloadImage({ task, index: 2, total: 5 });
  tracker.markDownloadAudio({ task, fileName: 'voice-001.opus' });
  tracker.markTranscribeAudio({ task, fileName: 'voice-001.opus' });
  tracker.markCodexExecution({ task });
  tracker.markCodexProgress({ task, summary: '开始分析消息' });
  tracker.markProgressDocWrite({ task, documentLabel: 'Codex 任务进度 2026-03-12 15:00' });

  assert.deepEqual(
    store.calls.map((entry) => [entry.method, entry.details?.phase, entry.details?.phaseLabel, entry.details?.subjectLabel]),
    [
      ['markBusy', 'message_received', '收到新消息', '文件消息'],
      ['markBusy', 'download_file', '正在下载文件', '需求文档.pdf'],
      ['markBusy', 'download_image', '正在下载图片', '第 2/5 张图片'],
      ['markBusy', 'download_audio', '正在下载语音', 'voice-001.opus'],
      ['markBusy', 'transcribe_audio', '正在语音转写', 'voice-001.opus'],
      ['markBusy', 'codex_exec', 'Codex 执行中', ''],
      ['markBusy', 'codex_exec', 'Codex 执行中', '开始分析消息'],
      ['markBusy', 'progress_doc_write', '正在写入进度文档', 'Codex 任务进度 2026-03-12 15:00'],
    ]
  );
  assert.deepEqual(store.calls[0].details.currentTask, task);
});

test('createFeishuRuntimeTracker records reply success, cancellation, and failure', () => {
  const store = createStoreSpy();
  const tracker = createFeishuRuntimeTracker({ store });
  const task = {
    chatId: 'oc_123',
    messageId: 'om_456',
    senderId: 'ou_789',
    summary: '给用户回复最终答案',
  };

  tracker.recordReplySuccess({ task, summary: '已发送最终答案' });
  tracker.recordReplyCancellation({ task, reason: '用户新消息覆盖当前任务' });
  tracker.recordReplyFailure(new Error('飞书接口超时'), { task });

  assert.deepEqual(
    store.calls.map((entry) => entry.method),
    ['recordReply', 'markIdle', 'markBusy', 'markIdle', 'markError']
  );
  assert.equal(store.calls[0].summary, '已发送最终答案');
  assert.equal(store.calls[2].details.phase, 'reply_cancelled');
  assert.equal(store.calls[2].details.phaseLabel, '任务已取消');
  assert.equal(store.calls[2].details.subjectLabel, '用户新消息覆盖当前任务');
  assert.equal(store.calls[4].details.phase, 'reply_send');
  assert.equal(store.calls[4].details.phaseLabel, '回复发送失败');
  assert.equal(store.calls[4].error.message, '飞书接口超时');
});
