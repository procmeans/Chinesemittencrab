function dispatchQueuedByChat(chatRunners, taskKey, data, handler, options = {}) {
  const createTaskControl = typeof options.createTaskControl === 'function'
    ? options.createTaskControl
    : () => ({});
  const shouldSupersede = typeof options.shouldSupersede === 'function'
    ? options.shouldSupersede
    : () => false;
  const isTaskCancelledError = typeof options.isTaskCancelledError === 'function'
    ? options.isTaskCancelledError
    : () => false;
  const onTaskError = typeof options.onTaskError === 'function'
    ? options.onTaskError
    : () => {};
  const onTaskQueued = typeof options.onTaskQueued === 'function'
    ? options.onTaskQueued
    : () => {};

  let runner = chatRunners.get(taskKey);
  if (!runner) {
    runner = {
      activeTask: null,
      pendingQueue: [],
      draining: false,
    };
    chatRunners.set(taskKey, runner);
  }

  if (runner.activeTask) {
    if (shouldSupersede(runner.activeTask, data)) {
      runner.pendingQueue = [data];
      if (typeof runner.activeTask.cancel === 'function') {
        void Promise.resolve(runner.activeTask.cancel('superseded_by_new_message')).catch(onTaskError);
      }
    } else {
      runner.pendingQueue.push(data);
      onTaskQueued({
        taskKey,
        queueSize: runner.pendingQueue.length,
      });
    }
    return;
  }

  runner.pendingQueue.push(data);
  if (runner.draining) {
    onTaskQueued({
      taskKey,
      queueSize: runner.pendingQueue.length,
    });
    return;
  }

  runner.draining = true;
  void (async () => {
    try {
      while (runner.pendingQueue.length > 0) {
        const nextData = runner.pendingQueue.shift();
        const taskControl = createTaskControl(taskKey);
        runner.activeTask = taskControl;
        try {
          await handler(nextData, taskControl);
        } catch (err) {
          if (!isTaskCancelledError(err)) {
            onTaskError(err);
          }
        } finally {
          runner.activeTask = null;
        }
      }
    } finally {
      runner.draining = false;
      if (!runner.activeTask && runner.pendingQueue.length === 0) {
        chatRunners.delete(taskKey);
      }
    }
  })();
}

module.exports = {
  dispatchQueuedByChat,
};
