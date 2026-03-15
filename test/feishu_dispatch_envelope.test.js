const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDispatchEnvelope } = require('../tools/lib/feishu_dispatch_envelope');

function makeDeps(now, recentMentionedSenders, recentReplyFollowUps = new Map()) {
  return {
    mentionAliases: ['小草的机器人'],
    botOpenId: 'ou_bot',
    recentMentionedSenders,
    recentReplyFollowUps,
    now,
    buildConversationScope(chatID, chatType, senderOpenID) {
      return {
        key: `${chatID}::${senderOpenID}`,
        kind: chatType || 'group',
      };
    },
    isGroupChat(chatType) {
      return String(chatType || '').trim().toLowerCase() !== 'p2p';
    },
    parseMessageText(content) {
      return typeof content === 'string' ? content : '';
    },
    parsePostContent(content) {
      return { text: typeof content === 'string' ? content : '' };
    },
    isBotMentioned(mentions, botOpenId) {
      return Array.isArray(mentions) && mentions.some((item) => item.open_id === botOpenId);
    },
    detectBotOpenIdCandidate(mentions, mentionAliases) {
      const aliasSet = new Set(mentionAliases);
      const matched = (mentions || []).find((item) => aliasSet.has(item.name));
      if (!matched) return null;
      return {
        openId: matched.open_id,
        name: matched.name,
      };
    },
    detectTextualBotMention(text, mentionAliases) {
      return mentionAliases.find((alias) => String(text || '').includes(alias)) || '';
    },
    rememberRecentMention(stateMap, chatID, senderOpenID, alias, timestamp) {
      stateMap.set(`${chatID}:${senderOpenID}`, {
        alias,
        timestamp,
      });
    },
    pruneMentionCarryState() {},
    getRecentMentionState(stateMap, chatID, senderOpenID) {
      return stateMap.get(`${chatID}:${senderOpenID}`) || null;
    },
    rememberReplyFollowUpWindow(stateMap, chatID, senderOpenID, timestamp) {
      stateMap.set(`${chatID}:${senderOpenID}`, {
        timestamp,
      });
    },
    pruneReplyFollowUpWindowState() {},
    getReplyFollowUpWindowState(stateMap, chatID, senderOpenID) {
      return stateMap.get(`${chatID}:${senderOpenID}`) || null;
    },
  };
}

test('buildDispatchEnvelope marks explicit group mentions as superseding work', () => {
  const recentMentionedSenders = new Map();
  const now = 1_000;
  const envelope = buildDispatchEnvelope({
    message: {
      chat_id: 'chat-1',
      chat_type: 'group',
      message_id: 'om_1',
      message_type: 'text',
      content: '@小草的机器人 继续处理',
      mentions: [{ open_id: 'ou_bot', name: '小草的机器人' }],
    },
    sender: {
      sender_id: {
        open_id: 'ou_user',
      },
    },
  }, makeDeps(now, recentMentionedSenders));

  assert.equal(envelope.taskKey, 'chat-1::ou_user');
  assert.equal(envelope.shouldSupersedeActiveTask, true);
  assert.deepEqual(envelope.payload.dispatchMeta, {
    explicitBotMention: true,
    allowMentionCarry: false,
    receivedAt: now,
  });
  assert.deepEqual(recentMentionedSenders.get('chat-1:ou_user'), {
    alias: '小草的机器人',
    timestamp: now,
  });
});

test('buildDispatchEnvelope preserves carry eligibility for queued attachment follow-ups', () => {
  const recentMentionedSenders = new Map([
    ['chat-1:ou_user', { alias: '小草的机器人', timestamp: 1_000 }],
  ]);
  const envelope = buildDispatchEnvelope({
    message: {
      chat_id: 'chat-1',
      chat_type: 'group',
      message_id: 'om_2',
      message_type: 'file',
      content: '',
      mentions: [],
    },
    sender: {
      sender_id: {
        open_id: 'ou_user',
      },
    },
  }, makeDeps(1_500, recentMentionedSenders));

  assert.equal(envelope.shouldSupersedeActiveTask, false);
  assert.deepEqual(envelope.payload.dispatchMeta, {
    explicitBotMention: false,
    allowMentionCarry: true,
    receivedAt: 1_500,
  });
});

test('buildDispatchEnvelope allows plain text carry inside a recent reply follow-up window', () => {
  const recentMentionedSenders = new Map();
  const recentReplyFollowUps = new Map([
    ['chat-1:ou_user', { timestamp: 1_200 }],
  ]);

  const envelope = buildDispatchEnvelope({
    message: {
      chat_id: 'chat-1',
      chat_type: 'group',
      message_id: 'om_3',
      message_type: 'text',
      content: '继续说说这个思路',
      mentions: [],
    },
    sender: {
      sender_id: {
        open_id: 'ou_user',
      },
    },
  }, makeDeps(1_500, recentMentionedSenders, recentReplyFollowUps));

  assert.equal(envelope.shouldSupersedeActiveTask, false);
  assert.deepEqual(envelope.payload.dispatchMeta, {
    explicitBotMention: false,
    allowMentionCarry: true,
    receivedAt: 1_500,
  });
});
