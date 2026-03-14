const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FEISHU_SEND_CHAT_DIRECTIVE_PREFIX,
  FEISHU_SEND_FILE_DIRECTIVE_PREFIX,
  FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX,
  extractFeishuReplyDirectives,
} = require('../tools/lib/feishu_reply_directives');

test('keeps plain reply text when no directives are present', () => {
  assert.deepEqual(
    extractFeishuReplyDirectives('这是最终结果'),
    {
      text: '这是最终结果',
      attachments: [],
      targetChatName: '',
      targetChatDirectiveError: '',
    }
  );
});

test('extracts file and image directives while preserving text', () => {
  const raw = [
    '第一段',
    `${FEISHU_SEND_FILE_DIRECTIVE_PREFIX}/tmp/report.pdf]]`,
    `${FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX}/tmp/chart.png]]`,
    '第二段',
  ].join('\n');

  assert.deepEqual(
    extractFeishuReplyDirectives(raw),
    {
      text: '第一段\n第二段',
      attachments: [
        { type: 'file', path: '/tmp/report.pdf' },
        { type: 'image', path: '/tmp/chart.png' },
      ],
      targetChatName: '',
      targetChatDirectiveError: '',
    }
  );
});

test('extracts a single target chat directive', () => {
  const raw = [
    '这是最终结果',
    `${FEISHU_SEND_CHAT_DIRECTIVE_PREFIX}YY专用机器人群]]`,
  ].join('\n');

  assert.deepEqual(
    extractFeishuReplyDirectives(raw),
    {
      text: '这是最终结果',
      attachments: [],
      targetChatName: 'YY专用机器人群',
      targetChatDirectiveError: '',
    }
  );
});

test('rejects multiple target chat directives', () => {
  const raw = [
    '这是最终结果',
    `${FEISHU_SEND_CHAT_DIRECTIVE_PREFIX}YY专用机器人群]]`,
    `${FEISHU_SEND_CHAT_DIRECTIVE_PREFIX}另一个群]]`,
  ].join('\n');

  assert.deepEqual(
    extractFeishuReplyDirectives(raw),
    {
      text: '这是最终结果',
      attachments: [],
      targetChatName: '',
      targetChatDirectiveError: 'multiple_target_chats',
    }
  );
});
