function cloneTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
  return JSON.parse(JSON.stringify(task));
}

function taskSummary(task) {
  return String(task?.summary || '').trim();
}

function createFeishuRuntimeTracker(options = {}) {
  const store = options.store;
  if (!store || typeof store !== 'object') {
    throw new Error('store is required');
  }

  const heartbeatIntervalMs = Math.max(1000, Number(options.heartbeatIntervalMs) || 5000);
  const setIntervalFn = typeof options.setIntervalFn === 'function' ? options.setIntervalFn : setInterval;
  const clearIntervalFn = typeof options.clearIntervalFn === 'function' ? options.clearIntervalFn : clearInterval;
  let heartbeatTimer = null;

  function markBusy(phase, phaseLabel, subjectLabel = '', task = null) {
    if (typeof store.markBusy !== 'function') return;
    store.markBusy({
      phase,
      phaseLabel,
      subjectLabel: String(subjectLabel || '').trim(),
      taskSummary: taskSummary(task),
      currentTask: cloneTask(task),
    });
  }

  return {
    startHeartbeat() {
      if (heartbeatTimer) return heartbeatTimer;
      heartbeatTimer = setIntervalFn(() => {
        if (typeof store.heartbeat === 'function') store.heartbeat();
      }, heartbeatIntervalMs);
      if (heartbeatTimer && typeof heartbeatTimer.unref === 'function') {
        heartbeatTimer.unref();
      }
      return heartbeatTimer;
    },
    stopHeartbeat() {
      if (!heartbeatTimer) return false;
      clearIntervalFn(heartbeatTimer);
      heartbeatTimer = null;
      return true;
    },
    markIdle() {
      if (typeof store.markIdle === 'function') store.markIdle();
    },
    markMessageAccepted({ task = null, subjectLabel = '' } = {}) {
      markBusy('message_received', '收到新消息', subjectLabel, task);
    },
    markDownloadFile({ task = null, fileName = '' } = {}) {
      markBusy('download_file', '正在下载文件', fileName, task);
    },
    markDownloadImage({ task = null, index = 1, total = 1 } = {}) {
      const position = Math.max(1, Number(index) || 1);
      const count = Math.max(position, Number(total) || position);
      markBusy('download_image', '正在下载图片', `第 ${position}/${count} 张图片`, task);
    },
    markDownloadAudio({ task = null, fileName = '' } = {}) {
      markBusy('download_audio', '正在下载语音', fileName, task);
    },
    markTranscribeAudio({ task = null, fileName = '' } = {}) {
      markBusy('transcribe_audio', '正在语音转写', fileName, task);
    },
    markCodexExecution({ task = null, subjectLabel = '' } = {}) {
      markBusy('codex_exec', 'Codex 执行中', subjectLabel, task);
    },
    markCodexProgress({ task = null, summary = '' } = {}) {
      markBusy('codex_exec', 'Codex 执行中', summary, task);
    },
    markProgressDocWrite({ task = null, documentLabel = '' } = {}) {
      markBusy('progress_doc_write', '正在写入进度文档', documentLabel, task);
    },
    recordReplySuccess({ task = null, summary = '' } = {}) {
      if (typeof store.recordReply === 'function') {
        store.recordReply(String(summary || '').trim() || taskSummary(task));
      }
      if (typeof store.markIdle === 'function') store.markIdle();
    },
    recordReplyCancellation({ task = null, reason = '' } = {}) {
      markBusy('reply_cancelled', '任务已取消', reason, task);
      if (typeof store.markIdle === 'function') store.markIdle();
    },
    recordReplyFailure(error, { task = null } = {}) {
      if (typeof store.markError !== 'function') return;
      store.markError(error, {
        phase: 'reply_send',
        phaseLabel: '回复发送失败',
        taskSummary: taskSummary(task),
        currentTask: cloneTask(task),
      });
    },
  };
}

module.exports = {
  createFeishuRuntimeTracker,
};
