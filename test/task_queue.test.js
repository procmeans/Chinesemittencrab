const test = require('node:test');
const assert = require('node:assert/strict');

const { dispatchQueuedByChat } = require('../tools/lib/task_queue');

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('dispatchQueuedByChat runs same-scope tasks sequentially without cancelling the active task', async () => {
  const chatRunners = new Map();
  const started = [];
  const finished = [];
  const cancelled = [];
  const waiting = [];

  function createTaskControl(taskKey) {
    return {
      taskKey,
      async cancel(reason = 'cancelled') {
        cancelled.push(reason);
        return true;
      },
    };
  }

  async function handler(data) {
    started.push(data.id);
    if (data.id === 1) {
      await new Promise((resolve) => waiting.push(resolve));
    }
    finished.push(data.id);
  }

  dispatchQueuedByChat(chatRunners, 'chat-1::user-1', { id: 1 }, handler, {
    createTaskControl,
  });
  await flushMicrotasks();

  dispatchQueuedByChat(chatRunners, 'chat-1::user-1', { id: 2 }, handler, {
    createTaskControl,
  });
  await flushMicrotasks();

  assert.deepEqual(started, [1]);
  assert.deepEqual(finished, []);
  assert.deepEqual(cancelled, []);

  waiting.pop()();
  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(finished, [1, 2]);
  assert.deepEqual(cancelled, []);
  assert.equal(chatRunners.size, 0);
});

test('dispatchQueuedByChat continues with queued work after a non-cancel error', async () => {
  const chatRunners = new Map();
  const started = [];
  const finished = [];
  const errors = [];

  function createTaskControl(taskKey) {
    return {
      taskKey,
      async cancel() {
        throw new Error('cancel should not be called');
      },
    };
  }

  async function handler(data) {
    started.push(data.id);
    if (data.id === 1) throw new Error('boom');
    finished.push(data.id);
  }

  dispatchQueuedByChat(chatRunners, 'chat-1::user-1', { id: 1 }, handler, {
    createTaskControl,
    onTaskError(err) {
      errors.push(err.message);
    },
  });
  dispatchQueuedByChat(chatRunners, 'chat-1::user-1', { id: 2 }, handler, {
    createTaskControl,
    onTaskError(err) {
      errors.push(err.message);
    },
  });

  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(finished, [2]);
  assert.deepEqual(errors, ['boom']);
  assert.equal(chatRunners.size, 0);
});

test('dispatchQueuedByChat can supersede the active task and replace pending work', async () => {
  const chatRunners = new Map();
  const started = [];
  const finished = [];
  const cancelled = [];
  const taskControls = [];
  let releaseActiveTask = null;
  let activeTaskWasCancelled = false;

  function createTaskControl(taskKey) {
    const taskControl = {
      taskKey,
      async cancel(reason = 'cancelled') {
        cancelled.push(reason);
        activeTaskWasCancelled = true;
        if (releaseActiveTask) releaseActiveTask();
        return true;
      },
    };
    taskControls.push(taskControl);
    return taskControl;
  }

  async function handler(data) {
    started.push(data.id);
    if (data.id === 1) {
      await new Promise((resolve) => {
        releaseActiveTask = resolve;
      });
      if (activeTaskWasCancelled) {
        const err = new Error('task cancelled');
        err.cancelled = true;
        throw err;
      }
    }
    finished.push(data.id);
  }

  dispatchQueuedByChat(chatRunners, 'chat-1::user-1', { id: 1 }, handler, {
    createTaskControl,
    isTaskCancelledError(err) {
      return Boolean(err?.cancelled);
    },
  });
  await flushMicrotasks();

  dispatchQueuedByChat(chatRunners, 'chat-1::user-1', { id: 2 }, handler, {
    createTaskControl,
    isTaskCancelledError(err) {
      return Boolean(err?.cancelled);
    },
    shouldSupersede() {
      return true;
    },
  });
  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(cancelled, ['superseded_by_new_message']);
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(finished, [2]);
  assert.equal(chatRunners.size, 0);
  assert.equal(taskControls.length, 2);
});
