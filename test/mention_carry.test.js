const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FEISHU_GROUP_MENTION_CARRY_WINDOW_MS,
  FEISHU_GROUP_REPLY_FOLLOW_UP_WINDOW_MS,
  getRecentMentionState,
  getReplyFollowUpWindowState,
  isMentionCarryEligibleMessage,
  isMentionlessGroupFileAllowed,
  rememberRecentMention,
  rememberReplyFollowUpWindow,
} = require('../tools/lib/mention_carry');

test('plain follow-up text is eligible for mention carry', () => {
  assert.equal(isMentionCarryEligibleMessage('text', '你帮我继续处理这个任务'), true);
});

test('text with another @ mention is not eligible for mention carry', () => {
  assert.equal(isMentionCarryEligibleMessage('text', '@张三 你看一下'), false);
});

test('attachment-style follow-ups remain eligible for mention carry', () => {
  assert.equal(isMentionCarryEligibleMessage('file', ''), true);
  assert.equal(isMentionCarryEligibleMessage('image', ''), true);
  assert.equal(isMentionCarryEligibleMessage('post', ''), true);
  assert.equal(isMentionCarryEligibleMessage('audio', ''), true);
});

test('recent mention state expires after the carry window', () => {
  const state = new Map();
  const now = 1_000;

  rememberRecentMention(state, 'chat-1', 'user-1', '小草的机器人', now);

  assert.deepEqual(getRecentMentionState(state, 'chat-1', 'user-1', now + 1), {
    timestamp: now,
    alias: '小草的机器人',
  });
  assert.equal(
    getRecentMentionState(state, 'chat-1', 'user-1', now + FEISHU_GROUP_MENTION_CARRY_WINDOW_MS + 1),
    null
  );
});

test('reply follow-up window state expires after the reply window', () => {
  const state = new Map();
  const now = 2_000;

  rememberReplyFollowUpWindow(state, 'chat-1', 'user-1', now);

  assert.deepEqual(getReplyFollowUpWindowState(state, 'chat-1', 'user-1', now + 1), {
    timestamp: now,
  });
  assert.equal(
    getReplyFollowUpWindowState(state, 'chat-1', 'user-1', now + FEISHU_GROUP_REPLY_FOLLOW_UP_WINDOW_MS + 1),
    null
  );
});

test('group file messages are allowed without a fresh @ mention', () => {
  assert.equal(isMentionlessGroupFileAllowed('file'), true);
  assert.equal(isMentionlessGroupFileAllowed('text'), false);
  assert.equal(isMentionlessGroupFileAllowed('image'), false);
});
