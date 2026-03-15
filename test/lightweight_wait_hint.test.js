const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDelayedWaitNotice,
  isSimpleQuestionInteraction,
} = require('../tools/lib/lightweight_wait_hint');

test('isSimpleQuestionInteraction returns true for a short question-like text message', () => {
  assert.equal(
    isSimpleQuestionInteraction({
      messageType: 'text',
      text: '这个报错是什么意思？',
    }),
    true
  );
});

test('isSimpleQuestionInteraction returns false for an obvious task-style request', () => {
  assert.equal(
    isSimpleQuestionInteraction({
      messageType: 'text',
      text: '帮我收集飞机大厨和类似游戏的最新消息，整理成文档发群里',
    }),
    false
  );
});

test('isSimpleQuestionInteraction returns false for non-text inputs', () => {
  assert.equal(
    isSimpleQuestionInteraction({
      messageType: 'file',
      text: '这个文件是什么',
    }),
    false
  );
});

test('createDelayedWaitNotice schedules a wait hint and recalls it after completion', async () => {
  const scheduled = [];
  const sent = [];
  const recalled = [];

  const notice = createDelayedWaitNotice({
    delayMs: 8000,
    message: '还在思考中，请稍等…',
    sendNotice: async (message) => {
      sent.push(message);
      return 'om_notice_1';
    },
    recallNotice: async (messageId) => {
      recalled.push(messageId);
      return true;
    },
    schedule(callback, delayMs) {
      const handle = { callback, delayMs, cancelled: false };
      scheduled.push(handle);
      return handle;
    },
    cancel(handle) {
      handle.cancelled = true;
    },
  });

  await notice.start();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 8000);
  assert.deepEqual(sent, []);

  await scheduled[0].callback();
  assert.deepEqual(sent, ['还在思考中，请稍等…']);

  const dismissed = await notice.dismiss();
  assert.equal(dismissed, true);
  assert.deepEqual(recalled, ['om_notice_1']);
});

test('createDelayedWaitNotice sends nothing when dismissed before the timer fires', async () => {
  const scheduled = [];
  const sent = [];
  const recalled = [];

  const notice = createDelayedWaitNotice({
    delayMs: 8000,
    sendNotice: async () => {
      sent.push('sent');
      return 'om_notice_2';
    },
    recallNotice: async (messageId) => {
      recalled.push(messageId);
      return true;
    },
    schedule(callback, delayMs) {
      const handle = { callback, delayMs, cancelled: false };
      scheduled.push(handle);
      return handle;
    },
    cancel(handle) {
      handle.cancelled = true;
    },
  });

  await notice.start();
  const dismissed = await notice.dismiss();
  assert.equal(dismissed, false);
  assert.equal(scheduled[0].cancelled, true);
  assert.deepEqual(sent, []);
  assert.deepEqual(recalled, []);
});

test('createDelayedWaitNotice updates the same notice with elapsed seconds every interval', async () => {
  const scheduled = [];
  const updates = [];
  let currentNow = 1000;

  const notice = createDelayedWaitNotice({
    delayMs: 8000,
    updateIntervalMs: 15000,
    sendNotice: async () => 'om_notice_3',
    updateNotice: async (messageId, message) => {
      updates.push({ messageId, message });
      return true;
    },
    schedule(callback, delayMs) {
      const handle = { callback, delayMs, cancelled: false };
      scheduled.push(handle);
      return handle;
    },
    cancel(handle) {
      handle.cancelled = true;
    },
    now: () => currentNow,
  });

  await notice.start();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 8000);

  currentNow = 9000;
  await scheduled[0].callback();
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].delayMs, 15000);

  currentNow = 24000;
  await scheduled[1].callback();
  assert.deepEqual(updates, [
    { messageId: 'om_notice_3', message: '还在思考中，已等待 23 秒…' },
  ]);
});
