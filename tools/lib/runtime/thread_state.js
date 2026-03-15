function compactText(raw, maxLength = 2000) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...(已截断)`;
}

function normalizeCommandText(text) {
  let raw = String(text || '');
  if (!raw) return '';
  raw = raw.replace(/\u00a0/g, ' ');
  raw = raw.replace(/\u200b/g, '');
  raw = raw.trim();
  if (!raw) return '';
  raw = raw.replace(/^／+/, '/');
  raw = raw.replace(/[ \t]+/g, ' ');
  return raw;
}

function isResetCommand(text) {
  const x = normalizeCommandText(text).toLowerCase();
  return x === '/reset' || x === '清空上下文' || x === '重置上下文';
}

function parseThreadCommand(text) {
  const raw = normalizeCommandText(text);
  if (!raw) return null;

  if (/^\/threads$/i.test(raw)) return { type: 'list' };
  if (!/^\/thread(?:\s|$)/i.test(raw)) return null;

  if (/^\/thread(?:\s+help)?$/i.test(raw)) return { type: 'help' };
  if (/^\/thread\s+list$/i.test(raw)) return { type: 'list' };
  if (/^\/thread\s+current$/i.test(raw)) return { type: 'current' };

  const newMatch = raw.match(/^\/thread\s+new(?:\s+(.+))?$/i);
  if (newMatch) {
    return {
      type: 'new',
      name: String(newMatch[1] || '').trim(),
    };
  }

  const switchMatch = raw.match(/^\/thread\s+switch\s+(.+)$/i);
  if (switchMatch) {
    return {
      type: 'switch',
      target: String(switchMatch[1] || '').trim(),
    };
  }

  return { type: 'help' };
}

function makeThread(threadId, name = '') {
  const threadName = String(name || '').trim() || `线程 ${threadId}`;
  return {
    id: threadId,
    name: threadName,
    codexThreadId: '',
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function ensureChatState(chatStates, stateKey) {
  const cached = chatStates.get(stateKey);
  if (cached) return cached;

  const firstThread = makeThread('t1', '主线程');
  const state = {
    threads: new Map([[firstThread.id, firstThread]]),
    order: [firstThread.id],
    currentThreadId: firstThread.id,
    nextThreadSeq: 2,
  };
  chatStates.set(stateKey, state);
  return state;
}

function getThreadTurnCount(thread) {
  if (!thread || !Array.isArray(thread.history)) return 0;
  return Math.ceil(thread.history.length / 2);
}

function getCurrentThread(state) {
  if (!state || !state.currentThreadId) return null;
  return state.threads.get(state.currentThreadId) || null;
}

function resolveThreadIdByTarget(state, target) {
  const raw = String(target || '').trim();
  if (!raw) return '';

  if (state.threads.has(raw)) return raw;
  if (/^\d+$/.test(raw)) {
    const mapped = `t${raw}`;
    if (state.threads.has(mapped)) return mapped;
  }

  const lower = raw.toLowerCase();
  const exactName = [];
  for (const threadId of state.order) {
    const thread = state.threads.get(threadId);
    if (!thread) continue;
    if (String(thread.name || '').toLowerCase() === lower) exactName.push(threadId);
  }
  if (exactName.length === 1) return exactName[0];
  if (exactName.length > 1) return '__ambiguous__';

  const fuzzyName = [];
  for (const threadId of state.order) {
    const thread = state.threads.get(threadId);
    if (!thread) continue;
    if (String(thread.name || '').toLowerCase().includes(lower)) fuzzyName.push(threadId);
  }
  if (fuzzyName.length === 1) return fuzzyName[0];
  if (fuzzyName.length > 1) return '__ambiguous__';

  return '';
}

function formatThreadHelp() {
  return [
    '线程命令：',
    '/threads',
    '/thread list',
    '/thread current',
    '/thread new [名称]',
    '/thread switch <线程ID或名称>',
    '/reset（清空当前线程上下文）',
  ].join('\n');
}

function formatThreadList(state) {
  const lines = ['线程列表：'];
  for (const threadId of state.order) {
    const thread = state.threads.get(threadId);
    if (!thread) continue;
    const marker = threadId === state.currentThreadId ? ' (当前)' : '';
    lines.push(`${threadId}${marker} · ${thread.name} · ${getThreadTurnCount(thread)} 轮`);
  }
  return lines.join('\n');
}

function handleThreadCommand(state, command) {
  if (!command) return { handled: false, reply: '' };

  if (command.type === 'help') {
    return { handled: true, reply: formatThreadHelp() };
  }

  if (command.type === 'list') {
    return { handled: true, reply: formatThreadList(state) };
  }

  if (command.type === 'current') {
    const current = getCurrentThread(state);
    if (!current) return { handled: true, reply: '当前线程不存在，请新建线程。' };
    return {
      handled: true,
      reply: `当前线程：${current.id} · ${current.name} · ${getThreadTurnCount(current)} 轮`,
    };
  }

  if (command.type === 'new') {
    const threadId = `t${state.nextThreadSeq}`;
    state.nextThreadSeq += 1;
    const thread = makeThread(threadId, command.name || '');
    state.threads.set(threadId, thread);
    state.order.push(threadId);
    state.currentThreadId = threadId;
    return {
      handled: true,
      reply: `已创建并切换到新线程：${thread.id} · ${thread.name}`,
    };
  }

  if (command.type === 'switch') {
    const resolved = resolveThreadIdByTarget(state, command.target);
    if (resolved === '__ambiguous__') {
      return {
        handled: true,
        reply: '匹配到多个线程，请用更精确的线程 ID 或完整名称。',
      };
    }
    if (!resolved) {
      return {
        handled: true,
        reply: `未找到线程：${command.target}`,
      };
    }
    state.currentThreadId = resolved;
    const current = getCurrentThread(state);
    return {
      handled: true,
      reply: `已切换到线程：${current.id} · ${current.name} · ${getThreadTurnCount(current)} 轮`,
    };
  }

  return { handled: false, reply: '' };
}

function buildCodexThreadTitle({ botName = '', localThreadName = '', userText = '' }) {
  const botLabel = compactText(String(botName || '飞书机器人').replace(/\s+/g, ' '), 24);
  const threadLabel = compactText(String(localThreadName || '主线程').replace(/\s+/g, ' '), 18);
  const userLabel = compactText(String(userText || '').replace(/\s+/g, ' '), 42);
  return [botLabel, threadLabel, userLabel].filter(Boolean).join(' | ');
}

module.exports = {
  buildCodexThreadTitle,
  ensureChatState,
  getCurrentThread,
  getThreadTurnCount,
  handleThreadCommand,
  isResetCommand,
  parseThreadCommand,
};
