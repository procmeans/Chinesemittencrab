const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDispatchEnvelope } = require('../tools/lib/feishu_dispatch_envelope');
const { resolveTargetChatByName } = require('../tools/lib/feishu_chat_target');
const { dispatchQueuedByChat } = require('../tools/lib/task_queue');
const {
  normalizeIncomingFeishuEvent,
} = require('../tools/lib/platform/feishu/incoming_event');
const {
  resolveReplyTarget,
} = require('../tools/lib/platform/feishu/reply_gateway');
const {
  generateCodexReply,
} = require('../tools/lib/codex/exec_service');
const {
  buildCodexPrompt,
} = require('../tools/lib/codex/prompt_builder');
const {
  composeQuotedPrompt,
  resolveReferencedMessageContext,
} = require('../tools/lib/referenced_message_context');
const {
  buildConversationScope,
  isGroupChat,
  parseMessageText,
  parsePostContent,
  projectFeishuMessageEvent,
} = require('../tools/lib/platform/feishu/event_projection');
const {
  ensureChatState,
  getCurrentThread,
  handleThreadCommand,
  isResetCommand,
} = require('../tools/lib/runtime/thread_state');

function readFixture(name) {
  const filePath = path.join(__dirname, 'fixtures', 'feishu', `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function extractMentionOpenId(mention = {}) {
  return String(
    mention?.open_id
    || mention?.id?.open_id
    || mention?.id?.user_id
    || mention?.id?.union_id
    || ''
  ).trim();
}

function buildReplayDeps({ mentionAliases, botOpenId, recentMentionedSenders, now }) {
  return {
    mentionAliases,
    botOpenId,
    recentMentionedSenders,
    now,
    buildConversationScope,
    isGroupChat,
    parseMessageText,
    parsePostContent,
    isBotMentioned(mentions, targetBotOpenId) {
      return Array.isArray(mentions) && mentions.some((item) => extractMentionOpenId(item) === targetBotOpenId);
    },
    detectBotOpenIdCandidate(mentions = [], aliases = []) {
      const aliasSet = new Set((aliases || []).map((item) => String(item || '').trim()).filter(Boolean));
      const matched = (mentions || []).find((item) => aliasSet.has(String(item?.name || '').trim()));
      if (!matched) return null;
      return {
        openId: extractMentionOpenId(matched),
        name: String(matched?.name || '').trim(),
      };
    },
    detectTextualBotMention(text, aliases = []) {
      const normalized = String(text || '');
      return aliases.find((alias) => new RegExp(`[@＠]\\s*${alias}`).test(normalized)) || '';
    },
    rememberRecentMention(stateMap, chatID, senderOpenID, alias, timestamp) {
      stateMap.set(`${chatID}:${senderOpenID}`, { alias, timestamp });
    },
    pruneMentionCarryState() {},
    getRecentMentionState(stateMap, chatID, senderOpenID) {
      return stateMap.get(`${chatID}:${senderOpenID}`) || null;
    },
  };
}

test('group mention fixture triggers a scoped task envelope', () => {
  const fixture = readFixture('group-at');
  const projection = projectFeishuMessageEvent(fixture);
  const recentMentionedSenders = new Map();
  const envelope = buildDispatchEnvelope(
    fixture.event,
    buildReplayDeps({
      mentionAliases: ['小草的机器人'],
      botOpenId: 'ou_bot_alias',
      recentMentionedSenders,
      now: 1_000,
    })
  );

  assert.equal(projection.incomingText, '@小草的机器人 继续整理这个需求');
  assert.equal(projection.conversationScope.key, 'oc_group_yy::ou_user_yy');
  assert.equal(projection.runtimeTaskSummary, '@小草的机器人 继续整理这个需求');
  assert.equal(envelope.taskKey, 'oc_group_yy::ou_user_yy');
  assert.equal(envelope.shouldSupersedeActiveTask, true);
  assert.deepEqual(envelope.payload.dispatchMeta, {
    explicitBotMention: true,
    allowMentionCarry: false,
    receivedAt: 1_000,
  });
});

test('quoted reply fixture attaches referenced message context before prompt composition', async () => {
  const fixture = readFixture('quoted-reply');
  const projection = projectFeishuMessageEvent(fixture);
  const client = {
    im: {
      v1: {
        message: {
          async get() {
            return {
              data: {
                item: fixture.referenced_message,
              },
            };
          },
        },
      },
    },
  };

  const referencedContext = await resolveReferencedMessageContext({
    client,
    message: fixture.event.message,
  });
  const prompt = composeQuotedPrompt({
    quotedText: referencedContext.text,
    currentText: projection.incomingText,
  });

  assert.equal(referencedContext.messageId, 'om_parent_requirement');
  assert.equal(referencedContext.text, '请帮我整理飞机大厨和类似游戏的最新消息，做成一个结论版本。');
  assert.equal(
    prompt,
    '引用消息：\n请帮我整理飞机大厨和类似游戏的最新消息，做成一个结论版本。\n\n当前消息：\n继续细化扩展这个方案'
  );
});

test('group file fixture keeps mention carry eligibility and projects file metadata', () => {
  const mentionFixture = readFixture('group-at');
  const fileFixture = readFixture('group-file');
  const recentMentionedSenders = new Map();

  buildDispatchEnvelope(
    mentionFixture.event,
    buildReplayDeps({
      mentionAliases: ['小草的机器人'],
      botOpenId: 'ou_bot_alias',
      recentMentionedSenders,
      now: 1_000,
    })
  );
  const envelope = buildDispatchEnvelope(
    fileFixture.event,
    buildReplayDeps({
      mentionAliases: ['小草的机器人'],
      botOpenId: 'ou_bot_alias',
      recentMentionedSenders,
      now: 1_150,
    })
  );
  const projection = projectFeishuMessageEvent(fileFixture);

  assert.equal(projection.parsedFile.fileName, '飞机大厨需求文档.pdf');
  assert.equal(projection.parsedFile.fileSize, 1048576);
  assert.equal(projection.runtimeMessageSubjectLabel, '飞机大厨需求文档.pdf');
  assert.equal(projection.runtimeTaskSummary, '文件消息：飞机大厨需求文档.pdf');
  assert.equal(envelope.shouldSupersedeActiveTask, false);
  assert.deepEqual(envelope.payload.dispatchMeta, {
    explicitBotMention: false,
    allowMentionCarry: true,
    receivedAt: 1_150,
  });
});

test('audio fixture projects duration-aware labels for runtime handling', () => {
  const fixture = readFixture('audio');
  const projection = projectFeishuMessageEvent(fixture);

  assert.equal(projection.messageType, 'audio');
  assert.equal(projection.parsedAudio.fileKey, 'audio_v3_00cc_voice001');
  assert.equal(projection.parsedAudio.durationMs, 18000);
  assert.equal(projection.runtimeMessageSubjectLabel, '语音消息（18 秒）');
  assert.equal(projection.runtimeTaskSummary, '语音消息（18 秒）');
});

test('route-to-chat fixture preserves the target group request and resolves a matching chat id', async () => {
  const fixture = readFixture('route-to-chat');
  const projection = projectFeishuMessageEvent(fixture);
  const client = {
    im: {
      v1: {
        chat: {
          async search() {
            return {
              data: {
                items: fixture.chat_search_results,
              },
            };
          },
        },
      },
    },
  };

  const resolution = await resolveTargetChatByName(client, fixture.target_chat_query);

  assert.match(projection.incomingText, /YY专用机器人群/);
  assert.deepEqual(resolution, {
    status: 'resolved',
    chatId: 'oc_target_yy',
    chatName: 'YY专用机器人群',
  });
});

test('incoming event adapter normalizes the raw Feishu payload into stable dispatch metadata', () => {
  const fixture = readFixture('group-at');
  const normalized = normalizeIncomingFeishuEvent(
    fixture.event,
    buildReplayDeps({
      mentionAliases: ['小草的机器人'],
      botOpenId: 'ou_bot_alias',
      recentMentionedSenders: new Map(),
      now: 2_000,
    })
  );

  assert.equal(normalized.taskKey, 'oc_group_yy::ou_user_yy');
  assert.equal(normalized.messageType, 'text');
  assert.equal(normalized.rawText, '@小草的机器人 继续整理这个需求');
  assert.equal(normalized.dispatchEnvelope.shouldSupersedeActiveTask, true);
});

test('reply gateway resolves the routed target chat without mutating the original source chat decision', async () => {
  const fixture = readFixture('route-to-chat');
  const client = {
    im: {
      v1: {
        chat: {
          async search() {
            return {
              data: {
                items: fixture.chat_search_results,
              },
            };
          },
        },
      },
    },
  };

  const resolution = await resolveReplyTarget({
    client,
    targetChatName: fixture.target_chat_query,
  });

  assert.deepEqual(resolution, {
    status: 'resolved',
    chatId: 'oc_target_yy',
    chatName: 'YY专用机器人群',
  });
});

test('same-sender replay events queue plain follow-ups and supersede on a fresh explicit mention', async () => {
  const first = readFixture('group-at');
  const followUp = readFixture('quoted-reply');
  const superseding = readFixture('group-at');
  superseding.event.message.message_id = 'om_group_at_2';
  superseding.event.message.content = '{"text":"@小草的机器人 改成最终结论版本"}';

  const recentMentionedSenders = new Map();
  const mentionAliases = ['小草的机器人'];
  const botOpenId = 'ou_bot_alias';
  const chatRunners = new Map();
  const started = [];
  const finished = [];
  const cancelled = [];
  let releaseActiveTask = null;
  let activeTaskWasCancelled = false;

  function buildEnvelope(data, now) {
    return buildDispatchEnvelope(
      data.event,
      buildReplayDeps({
        mentionAliases,
        botOpenId,
        recentMentionedSenders,
        now,
      })
    );
  }

  function createTaskControl(taskKey) {
    return {
      taskKey,
      async cancel(reason = 'cancelled') {
        cancelled.push(reason);
        activeTaskWasCancelled = true;
        if (releaseActiveTask) releaseActiveTask();
        return true;
      },
    };
  }

  async function handler(data) {
    const projection = projectFeishuMessageEvent(data.eventData);
    started.push(projection.messageID);
    if (projection.messageID === 'om_group_at_1') {
      await new Promise((resolve) => {
        releaseActiveTask = resolve;
      });
      if (activeTaskWasCancelled) {
        const err = new Error('task cancelled');
        err.cancelled = true;
        throw err;
      }
    }
    finished.push(projection.messageID);
  }

  const firstEnvelope = buildEnvelope(first, 1_000);
  dispatchQueuedByChat(chatRunners, firstEnvelope.taskKey, firstEnvelope.payload, handler, {
    createTaskControl,
    shouldSupersede: () => firstEnvelope.shouldSupersedeActiveTask,
    isTaskCancelledError(err) {
      return Boolean(err?.cancelled);
    },
  });
  await flushMicrotasks();

  const followUpEnvelope = buildEnvelope(followUp, 1_100);
  dispatchQueuedByChat(chatRunners, followUpEnvelope.taskKey, followUpEnvelope.payload, handler, {
    createTaskControl,
    shouldSupersede: () => followUpEnvelope.shouldSupersedeActiveTask,
    isTaskCancelledError(err) {
      return Boolean(err?.cancelled);
    },
  });
  await flushMicrotasks();

  assert.deepEqual(started, ['om_group_at_1']);
  assert.deepEqual(finished, []);
  assert.deepEqual(cancelled, []);

  const supersedingEnvelope = buildEnvelope(superseding, 1_200);
  dispatchQueuedByChat(chatRunners, supersedingEnvelope.taskKey, supersedingEnvelope.payload, handler, {
    createTaskControl,
    shouldSupersede: () => supersedingEnvelope.shouldSupersedeActiveTask,
    isTaskCancelledError(err) {
      return Boolean(err?.cancelled);
    },
  });

  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(cancelled, ['superseded_by_new_message']);
  assert.deepEqual(started, ['om_group_at_1', 'om_group_at_2']);
  assert.deepEqual(finished, ['om_group_at_2']);
  assert.equal(chatRunners.size, 0);
});

test('prompt builder preserves quoted context and thread history in fresh prompts', async () => {
  const fixture = readFixture('quoted-reply');
  const projection = projectFeishuMessageEvent(fixture);
  const client = {
    im: {
      v1: {
        message: {
          async get() {
            return {
              data: {
                item: fixture.referenced_message,
              },
            };
          },
        },
      },
    },
  };
  const referencedContext = await resolveReferencedMessageContext({
    client,
    message: fixture.event.message,
  });
  const userText = composeQuotedPrompt({
    quotedText: referencedContext.text,
    currentText: projection.incomingText,
  });

  const prompt = buildCodexPrompt({
    systemPrompt: '你是飞书里的开发助手。',
    history: [
      { role: 'user', text: '先帮我收集资料。' },
      { role: 'assistant', text: '我已经整理了一版初稿。' },
    ],
    userText,
    cwd: '/Users/procmeans/Documents/robot/yyyy',
    addDirs: ['/Users/procmeans/Documents/SunCodexClaw'],
    threadTitle: 'YY的烹饪游戏开发助手 | 主线程 | 飞机大厨',
  });

  assert.match(prompt, /YY的烹饪游戏开发助手 \| 主线程 \| 飞机大厨/);
  assert.match(prompt, /\[用户\] 先帮我收集资料。/);
  assert.match(prompt, /\[助手\] 我已经整理了一版初稿。/);
  assert.match(prompt, /引用消息：/);
  assert.match(prompt, /当前消息：/);
  assert.match(prompt, /额外可访问工作目录：/);
});

test('quoted interactive reply fixture keeps card markdown in the composed prompt', async () => {
  const projection = {
    incomingText: '继续基于上面的结论细化',
  };
  const client = {
    im: {
      v1: {
        message: {
          async get() {
            return {
              data: {
                item: {
                  message_id: 'om_card_reply',
                  msg_type: 'interactive',
                  body: {
                    content: JSON.stringify({
                      elements: [
                        {
                          tag: 'markdown',
                          content: '## 关键结论\n\n- 飞机大厨近期活动频繁\n- 竞品更新集中在节日版本',
                        },
                      ],
                    }),
                  },
                },
              },
            };
          },
        },
      },
    },
  };

  const referencedContext = await resolveReferencedMessageContext({
    client,
    message: {
      parent_id: 'om_card_reply',
    },
  });
  const userText = composeQuotedPrompt({
    quotedText: referencedContext.text,
    currentText: projection.incomingText,
  });

  assert.match(userText, /## 关键结论/);
  assert.match(userText, /飞机大厨近期活动频繁/);
  assert.match(userText, /当前消息：\n继续基于上面的结论细化/);
});

test('generateCodexReply falls back to a fresh prompt when the stored thread policy mismatches', async () => {
  const invocations = [];

  const result = await generateCodexReply({
    codex: {
      systemPrompt: '你是飞书里的开发助手。',
      cwd: '/Users/procmeans/Documents/robot/yyyy',
      addDirs: [],
      sandbox: 'danger-full-access',
      approvalPolicy: 'never',
    },
    history: [{ role: 'user', text: '旧上下文' }],
    userText: '继续完善这份结论',
    imagePaths: [],
    sessionId: 'thread-existing',
    threadTitle: 'YY线程',
    readThreadExecutionPolicy() {
      return {
        sandboxType: 'workspace-write',
        approvalMode: 'never',
      };
    },
    runExec: async ({ prompt, resumeSessionId }) => {
      invocations.push({ prompt, resumeSessionId });
      return {
        reply: 'fresh reply',
        threadId: 'thread-new',
      };
    },
  });

  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].resumeSessionId, '');
  assert.match(invocations[0].prompt, /对话上下文（按时间顺序，可能为空）：/);
  assert.equal(result.reply, 'fresh reply');
  assert.equal(result.threadId, 'thread-new');
});

test('thread state helpers preserve thread creation, switching, and reset semantics', () => {
  const chatStates = new Map();
  const state = ensureChatState(chatStates, 'oc_group_yy::ou_user_yy');

  const created = handleThreadCommand(state, {
    type: 'new',
    name: '深度调研',
  });
  assert.equal(created.handled, true);
  assert.match(created.reply, /已创建并切换到新线程：t2 · 深度调研/);
  assert.equal(getCurrentThread(state).id, 't2');

  const switched = handleThreadCommand(state, {
    type: 'switch',
    target: '主线程',
  });
  assert.equal(switched.handled, true);
  assert.match(switched.reply, /已切换到线程：t1 · 主线程/);
  assert.equal(getCurrentThread(state).id, 't1');

  assert.equal(isResetCommand('/reset'), true);
  assert.equal(isResetCommand('清空上下文'), true);
  assert.equal(isResetCommand('继续处理'), false);
});
