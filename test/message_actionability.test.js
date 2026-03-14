const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldSupersedeActiveTask } = require('../tools/lib/message_actionability');

test('bare mention does not supersede an active task', () => {
  assert.equal(
    shouldSupersedeActiveTask({
      messageType: 'text',
      rawText: '@_user_1',
      mentions: [{ key: '@_user_1', name: '小草的机器人' }],
      mentionAliases: ['小草的机器人'],
    }),
    false
  );
});

test('plain follow-up text still supersedes an active task', () => {
  assert.equal(
    shouldSupersedeActiveTask({
      messageType: 'text',
      rawText: '到哪里了 pdf呢',
      mentions: [],
      mentionAliases: ['小草的机器人'],
    }),
    true
  );
});

test('text with a mention and a real body supersedes an active task', () => {
  assert.equal(
    shouldSupersedeActiveTask({
      messageType: 'text',
      rawText: '@_user_1 到哪里了 pdf呢',
      mentions: [{ key: '@_user_1', name: '小草的机器人' }],
      mentionAliases: ['小草的机器人'],
    }),
    true
  );
});
